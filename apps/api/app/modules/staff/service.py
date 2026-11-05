"""Staff sign-in with a second factor, and enrolment (stage 14, D090).

1. `staff_login`: email and password, with the same limits and lockout as
   member sign-in. Anyone who isn't active staff gets the same answer as a
   wrong password. The right password gives a five-minute challenge: `verify`
   if an authenticator is enrolled, `enroll` if not.
2. `enroll` (first time, or after a reset): the challenge plus a one-time
   enrolment token from an admin or the CLI. A password alone never sets up a
   second factor. Returns a new TOTP secret, held encrypted in the challenge.
3. `verify`: the challenge plus a 6-digit code (or a recovery code). The first
   code after `enroll` completes the enrolment and returns ten recovery codes,
   once. Success opens a `web_admin` session: 12 hours, 30 minutes idle.

Wrong codes count per challenge (5) and per person (10 a day). Codes work once.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from cryptography.exceptions import InvalidTag
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.modules.accounts.models import User, UserRole, UserStatus
from app.modules.audit.service import record
from app.modules.auth.crypto import new_session_token
from app.modules.auth.models import Session, SessionClient
from app.modules.auth.service import (
    LOGIN_EMAIL,
    LOGIN_IP,
    AuthContext,
    deletion_pending,
    short_user_agent,
)
from app.modules.staff import crypto
from app.modules.staff.challenges import Challenges
from app.modules.staff.models import StaffEnrollment, StaffMfa, StaffRecoveryCode
from app.modules.staff.schemas import (
    ChallengeOut,
    EnrollIn,
    EnrollOut,
    StaffLoginIn,
    StaffMe,
    StaffMember,
    StaffSessionOut,
    VerifyIn,
)
from app.ratelimit import Limit

STAFF = (UserRole.moderator, UserRole.admin)
MFA_FAILURES = Limit("staff_mfa_failures", 10, 86_400)
ENROLL_ATTEMPTS = Limit("staff_enroll", 10, 3600)
ISSUE_LIMIT = Limit("staff_enrollment_issue", 20, 3600)


def _invalid_credentials() -> ApiError:
    return ApiError(401, "invalid_credentials", "The email or password is not correct.")


def _challenge_invalid() -> ApiError:
    return ApiError(400, "challenge_invalid", "This sign-in has expired. Start again with your password.")


def _is_staff(user: User) -> bool:
    return user.role in STAFF and user.status is UserStatus.active and not deletion_pending(user)


async def _locked_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt = select(User).where(User.id == user_id).with_for_update(key_share=True)
    return (await session.execute(stmt)).scalar_one_or_none()


def _secret(ctx: AuthContext) -> str:
    return ctx.settings.app_secret_key.get_secret_value()


# --- 1. password -----------------------------------------------------------------


async def staff_login(
    ctx: AuthContext, challenges: Challenges, session: AsyncSession, data: StaffLoginIn, ip: str
) -> ChallengeOut:
    s = ctx.settings
    now = ctx.clock()
    await ctx.limiter.hit(LOGIN_IP, ip)
    await ctx.limiter.hit(LOGIN_EMAIL, data.email)
    user = (
        await session.execute(select(User).where(User.email_normalized == data.email).with_for_update(key_share=True))
    ).scalar_one_or_none()
    if user is None:
        ctx.passwords.verify(None, data.password)  # equal timing
        raise _invalid_credentials()
    password_ok = ctx.passwords.verify(user.password_hash, data.password)
    if user.failed_login_count >= s.login_lockout_threshold:
        raise _invalid_credentials()
    if not password_ok:
        user.failed_login_count += 1
        record(session, "staff.login_failed", actor=None, target_type="user", target_id=user.id)
        await session.commit()
        raise _invalid_credentials()
    if not _is_staff(user):
        # The same answer as a wrong password: the console says nothing about roles.
        record(session, "staff.login_not_staff", actor=user.id, target_type="user", target_id=user.id)
        await session.commit()
        raise _invalid_credentials()

    user.failed_login_count = 0
    if ctx.passwords.needs_rehash(user.password_hash):
        user.password_hash = ctx.passwords.hash(data.password)
    enrolled = await session.get(StaffMfa, user.id) is not None
    record(session, "staff.password_ok", actor=user.id, target_type="user", target_id=user.id)
    await session.commit()
    value = await challenges.create(user.id, s.staff_challenge_ttl_s)
    return ChallengeOut(
        challenge=value,
        expires_at=now + timedelta(seconds=s.staff_challenge_ttl_s),
        next="verify" if enrolled else "enroll",
    )


# --- 2. enrolment ----------------------------------------------------------------


async def enroll(ctx: AuthContext, challenges: Challenges, session: AsyncSession, data: EnrollIn) -> EnrollOut:
    now = ctx.clock()
    found = await challenges.get(data.challenge)
    if found is None:
        raise _challenge_invalid()
    await ctx.limiter.hit(ENROLL_ATTEMPTS, str(found.user_id))
    user = await _locked_user(session, found.user_id)
    if user is None or not _is_staff(user):
        await challenges.consume(data.challenge)
        raise _challenge_invalid()
    if await session.get(StaffMfa, user.id) is not None:
        raise ApiError(409, "already_enrolled", "An authenticator is already set up. Enter a code from it.")
    token = (
        await session.execute(
            select(StaffEnrollment).where(
                StaffEnrollment.token_hash == crypto.enrollment_token_hash(data.enrollment_token),
                StaffEnrollment.user_id == user.id,
                StaffEnrollment.used_at.is_(None),
                StaffEnrollment.expires_at > now,
            )
        )
    ).scalar_one_or_none()
    if token is None:
        record(session, "staff.enroll_failed", actor=user.id, target_type="user", target_id=user.id)
        await session.commit()
        await challenges.failed(data.challenge)
        raise ApiError(400, "enrollment_invalid", "That enrolment token isn't valid. Ask an admin for a new one.")

    secret = crypto.new_totp_secret()
    account, user_id, token_id = user.email_normalized, user.id, token.id
    await session.rollback()  # nothing changed here; release the row lock (it also expires `user`)
    await challenges.set_pending(data.challenge, crypto.encrypt_secret(_secret(ctx), user_id, secret), token_id)
    issuer = f"{ctx.settings.brand_name} staff"
    return EnrollOut(secret=secret, otpauth_uri=crypto.provisioning_uri(secret, account, issuer))


# --- 3. the second factor --------------------------------------------------------


async def verify(
    ctx: AuthContext, challenges: Challenges, session: AsyncSession, data: VerifyIn, user_agent: str | None
) -> StaffSessionOut:
    now = ctx.clock()
    found = await challenges.get(data.challenge)
    if found is None:
        raise _challenge_invalid()
    failures_key = str(found.user_id)
    await ctx.limiter.check(MFA_FAILURES, failures_key)
    user = await _locked_user(session, found.user_id)
    if user is None or not _is_staff(user):
        await challenges.consume(data.challenge)
        raise _challenge_invalid()

    recovery: list[str] | None = None
    if found.pending_secret is not None:
        ok = await _complete_enrollment(
            ctx, session, user,
            secret_enc=found.pending_secret, enrollment_id=found.enrollment_id, code=data.code, now=now,
        )  # fmt: skip
        if ok is None:
            return await _failed(ctx, challenges, session, user, challenge=data.challenge, failures_key=failures_key)
        recovery = ok
    elif not await _check_factor(ctx, session, user, data.code, now):
        return await _failed(ctx, challenges, session, user, challenge=data.challenge, failures_key=failures_key)

    token, digest = new_session_token()
    expires = now + timedelta(hours=ctx.settings.staff_session_hours)
    session.add(
        Session(
            user_id=user.id, token_hash=digest, client=SessionClient.web_admin,
            user_agent=short_user_agent(user_agent), created_at=now, expires_at=expires, last_used_at=now,
        )
    )  # fmt: skip
    record(session, "staff.login", actor=user.id, target_type="user", target_id=user.id)
    await session.commit()
    await challenges.consume(data.challenge)
    return StaffSessionOut(
        token=token,
        expires_at=expires,
        idle_timeout_s=ctx.settings.staff_idle_minutes * 60,
        staff=await staff_me(session, user),
        recovery_codes=recovery,
    )


async def _complete_enrollment(
    ctx: AuthContext,
    session: AsyncSession,
    user: User,
    *,
    secret_enc: bytes,
    enrollment_id: uuid.UUID | None,
    code: str,
    now: datetime,
) -> list[str] | None:
    """The first code from the new authenticator. Returns the recovery codes, or None."""
    try:
        secret = crypto.decrypt_secret(_secret(ctx), user.id, secret_enc)
    except InvalidTag:
        return None
    step = crypto.matching_step(secret, code, now, 0)
    if step is None or enrollment_id is None:
        return None
    token = (
        await session.execute(select(StaffEnrollment).where(StaffEnrollment.id == enrollment_id).with_for_update())
    ).scalar_one_or_none()
    if token is None or token.used_at is not None or token.expires_at <= now or token.user_id != user.id:
        return None
    if await session.get(StaffMfa, user.id) is not None:  # a concurrent enrolment won
        return None
    token.used_at = now
    session.add(StaffMfa(user_id=user.id, secret_enc=secret_enc, enrolled_at=now, last_step=step))
    await session.execute(delete(StaffRecoveryCode).where(StaffRecoveryCode.user_id == user.id))
    codes = crypto.new_recovery_codes()
    for code_value in codes:
        session.add(
            StaffRecoveryCode(user_id=user.id, code_hash=crypto.recovery_code_hash(_secret(ctx), user.id, code_value))
        )
    record(session, "staff.mfa_enrolled", actor=user.id, target_type="user", target_id=user.id)
    return codes


async def _check_factor(ctx: AuthContext, session: AsyncSession, user: User, code: str, now: datetime) -> bool:
    """A TOTP code (6 digits) not used before, or an unused recovery code."""
    if code.isdigit():
        mfa = (
            await session.execute(select(StaffMfa).where(StaffMfa.user_id == user.id).with_for_update())
        ).scalar_one_or_none()
        if mfa is None:
            return False
        try:
            secret = crypto.decrypt_secret(_secret(ctx), user.id, mfa.secret_enc)
        except InvalidTag:
            return False
        step = crypto.matching_step(secret, code, now, mfa.last_step)
        if step is None:
            return False
        mfa.last_step = step
        return True
    used = (
        await session.execute(
            select(StaffRecoveryCode)
            .where(
                StaffRecoveryCode.user_id == user.id,
                StaffRecoveryCode.code_hash == crypto.recovery_code_hash(_secret(ctx), user.id, code),
                StaffRecoveryCode.used_at.is_(None),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if used is None:
        return False
    used.used_at = now
    record(session, "staff.recovery_code_used", actor=user.id, target_type="user", target_id=user.id)
    return True


async def _failed(
    ctx: AuthContext, challenges: Challenges, session: AsyncSession, user: User, *, challenge: str, failures_key: str
) -> StaffSessionOut:
    record(session, "staff.mfa_failed", actor=None, target_type="user", target_id=user.id)
    await session.commit()
    await ctx.limiter.record(MFA_FAILURES, failures_key)
    await challenges.failed(challenge)
    raise ApiError(400, "code_invalid", "That code didn't work. Check the time on your phone, or use a recovery code.")


# --- the session ----------------------------------------------------------------


async def staff_me(session: AsyncSession, user: User) -> StaffMe:
    left = (
        await session.execute(
            select(func.count())
            .select_from(StaffRecoveryCode)
            .where(StaffRecoveryCode.user_id == user.id, StaffRecoveryCode.used_at.is_(None))
        )
    ).scalar_one()
    role = "admin" if user.role is UserRole.admin else "moderator"
    return StaffMe(id=user.id, email=user.email_normalized, role=role, recovery_codes_left=int(left))


async def staff_logout(session: AsyncSession, sess: Session, now: datetime) -> None:
    sess.revoked_at = now
    record(session, "staff.logout", actor=sess.user_id, target_type="user", target_id=sess.user_id)
    await session.commit()


async def staff_list(session: AsyncSession, admin: User) -> list[StaffMember]:
    """Active staff accounts and whether each has an authenticator (admin; audited)."""
    rows = await session.execute(
        select(User, StaffMfa.user_id)
        .outerjoin(StaffMfa, StaffMfa.user_id == User.id)
        .where(User.role.in_(STAFF), User.status == UserStatus.active)
        .order_by(User.email_normalized)
    )
    out = [
        StaffMember(
            id=user.id, email=user.email_normalized,
            role="admin" if user.role is UserRole.admin else "moderator", enrolled=mfa is not None,
        )
        for user, mfa in rows.all()
    ]  # fmt: skip
    record(session, "staff.list_viewed", actor=admin.id)
    await session.commit()
    return out


# --- enrolment tokens --------------------------------------------------------------


async def issue_enrollment(
    session: AsyncSession, settings: Settings, issuer: User | None, target_id: uuid.UUID, now: datetime
) -> tuple[str, datetime]:
    """A one-time token for `target` to set up (or replace) an authenticator.

    It resets their second factor: the old authenticator, recovery codes,
    unused tokens and staff sessions all stop working. `issuer` is the admin,
    or None for the CLI. Admins can't issue one for themselves.
    """
    target = await _locked_user(session, target_id)
    if target is None or target.role not in STAFF:
        raise ApiError(404, "not_found")
    if issuer is not None and issuer.id == target.id:
        raise ApiError(409, "own_account", "Ask another admin to reset your authenticator.")
    if target.status is not UserStatus.active:
        raise ApiError(409, "account_inactive", "That staff account isn't active.")
    await session.execute(delete(StaffMfa).where(StaffMfa.user_id == target.id))
    await session.execute(delete(StaffRecoveryCode).where(StaffRecoveryCode.user_id == target.id))
    await session.execute(
        update(StaffEnrollment)
        .where(StaffEnrollment.user_id == target.id, StaffEnrollment.used_at.is_(None))
        .values(used_at=now)
    )
    await session.execute(
        update(Session)
        .where(Session.user_id == target.id, Session.client == SessionClient.web_admin, Session.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    token, digest = crypto.new_enrollment_token()
    expires = now + timedelta(hours=settings.staff_enrollment_hours)
    session.add(
        StaffEnrollment(
            user_id=target.id, token_hash=digest, issued_by=issuer.id if issuer else None,
            created_at=now, expires_at=expires,
        )
    )  # fmt: skip
    record(
        session, "staff.enrollment_issued", actor=issuer.id if issuer else None, target_type="user",
        target_id=target.id, via="admin" if issuer else "cli",
    )  # fmt: skip
    await session.commit()
    return token, expires
