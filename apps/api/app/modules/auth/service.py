"""Auth flows (F01): register, verify email, resend, login, sessions, logout,
password reset. Security properties and where they come from:

- No enumeration (T04): register, resend and reset answer the same way for
  known and unknown emails; every path hashes or verifies a password, so
  timing stays in one class; emails go out from the worker, not the request.
- Age gate (D016): under-18 sign-ups are refused before anything is stored
  or counted; the age is "declared", never "verified".
- Codes (T02, NIST SP 800-63B-4): 6 digits, 10 minutes, single use, HMAC at
  rest, at most 5 tries per code and 10 failures a day per account and
  purpose; issuing a new code does not reset the failure count.
- Pre-hijacking (D045): verifying an email also requires the password set at
  sign-up, so a stranger who registered someone else's address first cannot
  end up holding the account.
- Sessions (D023, T03): opaque 256-bit tokens, stored as SHA-256; 30-day
  sliding expiry; revoked on logout, logout-all and password reset.
- Lockout (NIST): 100 consecutive failed logins pause password sign-in until
  a reset; the response never says so (the member is emailed instead).
- Deletion (D083): an account waiting for deletion can't hold a session.
  With the right password, sign-in says so and `restore` keeps the account;
  a password reset still works, so a forgotten password doesn't stop that.
  A banned account's email can't sign up again for a year after its purge,
  and sign-up answers exactly as usual.
"""

from __future__ import annotations

import enum
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import Clock
from app.config import Settings
from app.errors import ApiError
from app.jobs import JobQueue
from app.logs import request_id_var
from app.modules.accounts.models import Consent, ConsentKind, User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth import emails
from app.modules.auth.crypto import (
    banned_email_digest,
    code_digest,
    derive_key,
    digests_equal,
    hash_session_token,
    new_code,
    new_session_token,
)
from app.modules.auth.models import CodePurpose, OneTimeCode, Session, SessionClient, SignupInvite
from app.modules.auth.passwords import Passwords, password_problems
from app.modules.auth.schemas import (
    LoginIn,
    MeOut,
    PasswordResetConfirmIn,
    RegisterIn,
    SessionOut,
    Verification,
    VerifyEmailIn,
)
from app.modules.privacy.models import DeletedAccount
from app.modules.privacy.retention import ACCOUNT_GRACE
from app.providers.email import EmailSender
from app.providers.identity import IdentityStatus
from app.ratelimit import Limit, RateLimiter

ISSUE_CODE = "auth:issue_code"
SEND_NOTICE = "auth:send_notice"
ADULT_AGE = 18
MAX_AGE = 120

# Per-IP limits use the full IP (hashed in Redis); per-email limits apply
# whether or not the account exists.
REGISTER_IP = Limit("register_ip", 10, 3600)
REGISTER_EMAIL = Limit("register_email", 5, 3600)
CODE_IP = Limit("code_ip", 20, 3600)
CODE_COOLDOWN = Limit("code_cooldown", 1, 60)
CODE_DAILY = Limit("code_daily", 10, 86_400)
VERIFY_IP = Limit("verify_ip", 30, 900)
VERIFY_EMAIL = Limit("verify_email", 10, 900)
VERIFY_FAILURES = Limit("verify_failures", 10, 86_400)
LOGIN_IP = Limit("login_ip", 30, 900)
LOGIN_EMAIL = Limit("login_email", 10, 900)

_UA_TOKEN = re.compile(r"^[\x21-\x7e]{1,64}")


class Notice(enum.StrEnum):
    signup_attempt = "signup_attempt"
    password_changed = "password_changed"  # noqa: S105 - a notice kind
    password_locked = "password_locked"  # noqa: S105 - a notice kind


@dataclass(frozen=True)
class AuthContext:
    settings: Settings
    passwords: Passwords
    limiter: RateLimiter
    jobs: JobQueue
    clock: Clock

    @property
    def code_key(self) -> bytes:
        return code_key(self.settings)


def code_key(settings: Settings) -> bytes:
    return derive_key(settings.app_secret_key.get_secret_value(), "one-time-code")


def banned_email_key(settings: Settings) -> bytes:
    return derive_key(settings.app_secret_key.get_secret_value(), "banned-email")


def invite_key(settings: Settings) -> bytes:
    return derive_key(settings.app_secret_key.get_secret_value(), "signup-invite")


def invite_digest(settings: Settings, email: str) -> bytes:
    return banned_email_digest(invite_key(settings), email)


async def invited(session: AsyncSession, settings: Settings, email: str, now: datetime) -> bool:
    found = await session.execute(
        select(SignupInvite.email_digest).where(
            SignupInvite.email_digest == invite_digest(settings, email), SignupInvite.expires_at > now
        )
    )
    return found.first() is not None


async def add_invites(session: AsyncSession, settings: Settings, emails: list[str], now: datetime) -> int:
    """Invite (or re-invite, renewing the expiry). Commits. Counts only are audited."""
    expires = now + timedelta(days=settings.invite_days)
    digests = {invite_digest(settings, e) for e in emails}
    for digest in digests:
        await session.execute(
            pg_insert(SignupInvite)
            .values(email_digest=digest, created_at=now, expires_at=expires)
            .on_conflict_do_update(
                index_elements=[SignupInvite.email_digest], set_={"created_at": now, "expires_at": expires}
            )
        )
    session.add(AuditLog(actor_id=None, action="auth.invites_added", details={"count": len(digests)}))
    await session.commit()
    return len(digests)


async def remove_invites(session: AsyncSession, settings: Settings, emails: list[str]) -> int:
    digests = {invite_digest(settings, e) for e in emails}
    removed = len(
        (
            await session.execute(
                delete(SignupInvite).where(SignupInvite.email_digest.in_(digests)).returning(SignupInvite.email_digest)
            )
        ).all()
    )
    session.add(AuditLog(actor_id=None, action="auth.invites_removed", details={"count": removed}))
    await session.commit()
    return removed


async def live_invites(session: AsyncSession, now: datetime) -> int:
    return int(
        (
            await session.execute(select(func.count()).select_from(SignupInvite).where(SignupInvite.expires_at > now))
        ).scalar_one()
    )


def deletion_pending(user: User) -> bool:
    """Waiting for its purge (D083). Hidden everywhere; no sessions."""
    return user.deletion_requested_at is not None


def purge_after(user: User) -> datetime:
    """When the grace period ends (the purge may wait for an open report)."""
    if user.deletion_requested_at is None:
        raise ValueError("no deletion requested")
    return user.deletion_requested_at + ACCOUNT_GRACE


def can_reset_password(user: User) -> bool:
    return user.status is UserStatus.active or (user.status is UserStatus.deactivated and deletion_pending(user))


async def email_barred(session: AsyncSession, settings: Settings, email: str, now: datetime) -> bool:
    """A banned account with this email was purged less than a year ago."""
    digest = banned_email_digest(banned_email_key(settings), email)
    found = await session.execute(
        select(DeletedAccount.user_id).where(DeletedAccount.email_digest == digest, DeletedAccount.keep_until > now)
    )
    return found.first() is not None


# --- helpers ---------------------------------------------------------------


def local_today(settings: Settings, now: datetime) -> date:
    return now.astimezone(settings.tz).date()


def age_on(birthdate: date, today: date) -> int:
    return today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))


def short_user_agent(raw: str | None) -> str | None:
    """Only the first product token (e.g. `okhttp/4.12`), never the full header."""
    if not raw:
        return None
    match = _UA_TOKEN.match(raw.strip())
    return match.group(0) if match else None


def _audit(session: AsyncSession, action: str, user_id: uuid.UUID | None, *, actor: uuid.UUID | None = None) -> None:
    session.add(
        AuditLog(
            actor_id=actor,
            action=action,
            target_type="user" if user_id else None,
            target_id=user_id,
            request_id=request_id_var.get(),
        )
    )


def _verification_failed() -> ApiError:
    return ApiError(400, "verification_failed", "The code or password is not correct, or the code has expired.")


def _invalid_credentials() -> ApiError:
    return ApiError(401, "invalid_credentials", "The email or password is not correct.")


async def _user_by_email(session: AsyncSession, email: str, *, lock: bool = False) -> User | None:
    stmt = select(User).where(User.email_normalized == email)
    if lock:
        stmt = stmt.with_for_update(key_share=True)
    return (await session.execute(stmt)).scalar_one_or_none()


def _check_password_policy(ctx: AuthContext, password: str, email: str) -> None:
    s = ctx.settings
    problems = password_problems(
        password, email=email, brand=s.brand_name, min_length=s.password_min_length, max_length=s.password_max_length
    )
    if problems:
        raise ApiError(
            422,
            "weak_password",
            f"Choose a different password: at least {s.password_min_length} characters, not a common or "
            "breached password, and not based on your email or the app's name.",
            extra={"problems": [p.value for p in problems]},
        )


def me_out(user: User, settings: Settings, now: datetime, identity: IdentityStatus = "not_checked") -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email_normalized,
        birthdate=user.birthdate,
        age=age_on(user.birthdate, local_today(settings, now)),
        status=user.status.value,
        role=user.role.value,
        verification=Verification(
            age="declared",
            email="verified" if user.email_verified_at is not None else "unverified",
            identity=identity,
        ),
        created_at=user.created_at,
    )


def _open_session(
    session: AsyncSession, settings: Settings, user: User, now: datetime, user_agent: str | None
) -> tuple[str, datetime]:
    token, digest = new_session_token()
    expires = now + timedelta(days=settings.session_ttl_days)
    session.add(
        Session(
            user_id=user.id,
            token_hash=digest,
            client=SessionClient.mobile,
            user_agent=short_user_agent(user_agent),
            created_at=now,
            expires_at=expires,
            last_used_at=now,
        )
    )
    user.last_active_at = now
    return token, expires


async def _take_live_code(
    ctx: AuthContext, session: AsyncSession, user: User, purpose: CodePurpose, *, code: str, now: datetime
) -> tuple[OneTimeCode | None, bool]:
    """(row, ok). Counts a failed try on the row when there is one."""
    row = (
        await session.execute(
            select(OneTimeCode)
            .where(OneTimeCode.user_id == user.id, OneTimeCode.purpose == purpose, OneTimeCode.consumed_at.is_(None))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        return None, False
    usable = row.expires_at > now and row.attempts < ctx.settings.code_max_attempts
    ok = usable and digests_equal(row.code_hash, code_digest(ctx.code_key, user.id, purpose.value, code))
    return row, ok


# --- flows -----------------------------------------------------------------


async def register(ctx: AuthContext, session: AsyncSession, data: RegisterIn, ip: str) -> None:
    s = ctx.settings
    now = ctx.clock()
    today = local_today(s, now)
    # The age gate runs first: nothing about an under-18 visitor is stored or counted.
    if data.birthdate > today or age_on(data.birthdate, today) > MAX_AGE:
        raise ApiError(422, "invalid_birthdate", "Enter your real date of birth.")
    if age_on(data.birthdate, today) < ADULT_AGE:
        raise ApiError(422, "underage", f"You must be {ADULT_AGE} or older to join.")
    _check_password_policy(ctx, data.password, data.email)
    if data.consents.terms != s.terms_version or data.consents.privacy != s.privacy_version:
        raise ApiError(
            422,
            "consent_required",
            "Accept the current terms and privacy notice to continue.",
            extra={"required": {"terms": s.terms_version, "privacy": s.privacy_version}},
        )

    await ctx.limiter.hit(REGISTER_IP, ip)
    await ctx.limiter.hit(REGISTER_EMAIL, data.email)
    password_hash = ctx.passwords.hash(data.password)  # on every path, for equal timing

    user = await _user_by_email(session, data.email, lock=True)
    if user is None and await email_barred(session, s, data.email, now):
        _audit(session, "auth.register_barred", None)  # the same answer, and no code
        await session.commit()
        return
    if user is None and s.signup_invite_only and not await invited(session, s, data.email, now):
        # The same answer as any sign-up, and nothing stored or sent: whether an
        # email is on the invite list is not revealed (D096).
        _audit(session, "auth.register_not_invited", None)
        await session.commit()
        return
    if user is None:
        new_id = (
            await session.execute(
                pg_insert(User)
                .values(
                    email_normalized=data.email,
                    password_hash=password_hash,
                    birthdate=data.birthdate,
                    status=UserStatus.pending,
                    created_at=now,
                    updated_at=now,
                )
                .on_conflict_do_nothing(index_elements=[User.email_normalized])
                .returning(User.id)
            )
        ).scalar_one_or_none()
        user = await _user_by_email(session, data.email, lock=True)
        if user is None:  # inserted above, or by a concurrent request that committed
            raise RuntimeError("user row missing after insert")
        created = new_id is not None
    else:
        created = False

    if created or user.status is UserStatus.pending:
        if not created:
            # A repeat sign-up before verification: the latest password wins,
            # and verification requires it (D045).
            user.password_hash = password_hash
            user.birthdate = data.birthdate
        for kind, version in ((ConsentKind.terms, s.terms_version), (ConsentKind.privacy, s.privacy_version)):
            await session.execute(
                pg_insert(Consent)
                .values(user_id=user.id, kind=kind, version=version, granted_at=now)
                .on_conflict_do_nothing()
            )
        _audit(session, "auth.register", user.id)
        await ctx.jobs.defer(session, ISSUE_CODE, user_id=str(user.id), purpose=CodePurpose.verify_email.value)
    else:
        _audit(session, "auth.register_existing", user.id)
        await ctx.jobs.defer(session, SEND_NOTICE, user_id=str(user.id), kind=Notice.signup_attempt.value)
    await session.commit()


async def resend_code(ctx: AuthContext, session: AsyncSession, email: str, ip: str) -> None:
    await ctx.limiter.hit(CODE_IP, ip)
    await ctx.limiter.hit(CODE_COOLDOWN, f"verify_email:{email}")
    await ctx.limiter.hit(CODE_DAILY, f"verify_email:{email}")
    user = await _user_by_email(session, email)
    if user is not None and user.status is UserStatus.pending:
        await ctx.jobs.defer(session, ISSUE_CODE, user_id=str(user.id), purpose=CodePurpose.verify_email.value)
        await session.commit()


async def verify_email(
    ctx: AuthContext, session: AsyncSession, data: VerifyEmailIn, ip: str, user_agent: str | None
) -> SessionOut:
    now = ctx.clock()
    await ctx.limiter.hit(VERIFY_IP, ip)
    await ctx.limiter.hit(VERIFY_EMAIL, f"verify_email:{data.email}")
    user = await _user_by_email(session, data.email, lock=True)
    if user is None or user.status is not UserStatus.pending:
        ctx.passwords.verify(None, data.password)
        raise _verification_failed()
    failures_key = f"{CodePurpose.verify_email.value}:{user.id}"
    await ctx.limiter.check(VERIFY_FAILURES, failures_key)

    row, code_ok = await _take_live_code(ctx, session, user, CodePurpose.verify_email, code=data.code, now=now)
    password_ok = ctx.passwords.verify(user.password_hash, data.password)
    if row is None or not (code_ok and password_ok):
        if row is not None:
            row.attempts += 1
        _audit(session, "auth.verify_failed", user.id)
        await session.commit()
        await ctx.limiter.record(VERIFY_FAILURES, failures_key)
        raise _verification_failed()

    row.consumed_at = now
    user.status = UserStatus.active
    user.email_verified_at = now
    # The invite has done its job (D096): the account exists now.
    invite = invite_digest(ctx.settings, user.email_normalized)
    await session.execute(delete(SignupInvite).where(SignupInvite.email_digest == invite))
    user.failed_login_count = 0
    token, expires = _open_session(session, ctx.settings, user, now, user_agent)
    _audit(session, "auth.email_verified", user.id, actor=user.id)
    await session.commit()
    return SessionOut(token=token, expires_at=expires, user=me_out(user, ctx.settings, now))


async def login(
    ctx: AuthContext, session: AsyncSession, data: LoginIn, ip: str, user_agent: str | None, *, restore: bool = False
) -> SessionOut:
    """Sign in. With `restore`, an account waiting for deletion is kept (D083)."""
    s = ctx.settings
    now = ctx.clock()
    await ctx.limiter.hit(LOGIN_IP, ip)
    await ctx.limiter.hit(LOGIN_EMAIL, data.email)
    user = await _user_by_email(session, data.email, lock=True)
    if user is None:
        ctx.passwords.verify(None, data.password)
        raise _invalid_credentials()

    password_ok = ctx.passwords.verify(user.password_hash, data.password)
    if user.failed_login_count >= s.login_lockout_threshold:
        raise _invalid_credentials()  # locked until a password reset; the member was emailed
    if not password_ok:
        user.failed_login_count += 1
        _audit(session, "auth.login_failed", user.id)
        if user.failed_login_count == s.login_lockout_threshold:
            _audit(session, "auth.password_locked", user.id)
            await ctx.jobs.defer(session, SEND_NOTICE, user_id=str(user.id), kind=Notice.password_locked.value)
        await session.commit()
        raise _invalid_credentials()

    # The password is right, so the account's state can be told to its holder.
    if user.status is UserStatus.pending:
        raise ApiError(403, "email_not_verified", "Confirm your email address first: we can send a new code.")
    if user.status is UserStatus.deactivated and deletion_pending(user):
        if not restore:
            raise ApiError(
                403, "deletion_scheduled", "This account is waiting to be deleted. You can still keep it.",
                extra={"purge_after": purge_after(user).isoformat()},
            )  # fmt: skip
        user.status = UserStatus.active
        user.deletion_requested_at = None
        _audit(session, "account.restored", user.id, actor=user.id)
    if user.status is not UserStatus.active:
        raise ApiError(403, f"account_{user.status.value}", "This account cannot sign in. Contact support.")

    user.failed_login_count = 0
    if ctx.passwords.needs_rehash(user.password_hash):
        user.password_hash = ctx.passwords.hash(data.password)
    token, expires = _open_session(session, s, user, now, user_agent)
    _audit(session, "auth.login", user.id, actor=user.id)
    await session.commit()
    return SessionOut(token=token, expires_at=expires, user=me_out(user, s, now))


async def request_password_reset(ctx: AuthContext, session: AsyncSession, email: str, ip: str) -> None:
    await ctx.limiter.hit(CODE_IP, ip)
    await ctx.limiter.hit(CODE_COOLDOWN, f"reset_password:{email}")
    await ctx.limiter.hit(CODE_DAILY, f"reset_password:{email}")
    user = await _user_by_email(session, email)
    if user is not None and can_reset_password(user):
        _audit(session, "auth.password_reset_requested", user.id)
        await ctx.jobs.defer(session, ISSUE_CODE, user_id=str(user.id), purpose=CodePurpose.reset_password.value)
        await session.commit()


async def confirm_password_reset(
    ctx: AuthContext, session: AsyncSession, data: PasswordResetConfirmIn, ip: str
) -> uuid.UUID:
    """Returns the member's ID (every session is revoked)."""
    now = ctx.clock()
    await ctx.limiter.hit(VERIFY_IP, ip)
    await ctx.limiter.hit(VERIFY_EMAIL, f"reset_password:{data.email}")
    _check_password_policy(ctx, data.new_password, data.email)
    user = await _user_by_email(session, data.email, lock=True)
    if user is None or not can_reset_password(user):
        ctx.passwords.hash(data.new_password)
        raise _verification_failed()
    failures_key = f"{CodePurpose.reset_password.value}:{user.id}"
    await ctx.limiter.check(VERIFY_FAILURES, failures_key)

    row, ok = await _take_live_code(ctx, session, user, CodePurpose.reset_password, code=data.code, now=now)
    if row is None or not ok:
        if row is not None:
            row.attempts += 1
        _audit(session, "auth.verify_failed", user.id)
        await session.commit()
        await ctx.limiter.record(VERIFY_FAILURES, failures_key)
        raise _verification_failed()

    row.consumed_at = now
    user.password_hash = ctx.passwords.hash(data.new_password)
    user.failed_login_count = 0
    await revoke_all_sessions(session, user.id, now)
    _audit(session, "auth.password_reset", user.id, actor=user.id)
    await ctx.jobs.defer(session, SEND_NOTICE, user_id=str(user.id), kind=Notice.password_changed.value)
    await session.commit()
    return user.id


# --- sessions ----------------------------------------------------------------


STAFF_TOUCH = timedelta(seconds=60)


async def authenticate(
    session: AsyncSession,
    settings: Settings,
    token: str,
    now: datetime,
    client: SessionClient = SessionClient.mobile,
) -> tuple[Session, User] | None:
    """The session behind `token`, if it is live and of the expected client: a
    member session never opens /v1/admin and a staff session never acts as a
    member (D090)."""
    row = (
        await session.execute(
            select(Session, User)
            .join(User, User.id == Session.user_id)
            .where(Session.token_hash == hash_session_token(token), Session.client == client)
        )
    ).one_or_none()
    if row is None:
        return None
    sess, user = row
    if (
        sess.revoked_at is not None
        or sess.expires_at <= now
        or user.status is not UserStatus.active
        or deletion_pending(user)
    ):
        return None
    if client is SessionClient.web_admin:
        # Staff: a fixed 12-hour life and a 30-minute idle timeout (architecture).
        last = sess.last_used_at or sess.created_at
        if now - last >= timedelta(minutes=settings.staff_idle_minutes):
            return None
        if now - last >= STAFF_TOUCH:
            sess.last_used_at = now
            await session.commit()
        return sess, user
    # Sliding expiry, written at most once per touch interval.
    if sess.last_used_at is None or now - sess.last_used_at >= timedelta(seconds=settings.session_touch_interval_s):
        sess.last_used_at = now
        sess.expires_at = now + timedelta(days=settings.session_ttl_days)
        user.last_active_at = now
        await session.commit()
    return sess, user


async def session_is_live(session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, now: datetime) -> bool:
    """For long-lived connections (realtime): not revoked, not expired, account active."""
    found = (
        await session.execute(
            select(Session.id)
            .join(User, User.id == Session.user_id)
            .where(
                Session.id == session_id,
                Session.user_id == user_id,
                Session.client == SessionClient.mobile,
                Session.revoked_at.is_(None),
                Session.expires_at > now,
                User.status == UserStatus.active,
                User.deletion_requested_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    return found is not None


async def logout(session: AsyncSession, sess: Session, now: datetime) -> None:
    sess.revoked_at = now
    _audit(session, "auth.logout", sess.user_id, actor=sess.user_id)
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await session.execute(
        update(Session).where(Session.user_id == user_id, Session.revoked_at.is_(None)).values(revoked_at=now)
    )


async def logout_all(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await revoke_all_sessions(session, user_id, now)
    _audit(session, "auth.logout_all", user_id, actor=user_id)
    await session.commit()


# --- worker side ---------------------------------------------------------------


async def issue_code(
    session: AsyncSession,
    settings: Settings,
    sender: EmailSender,
    *,
    now: datetime,
    user_id: uuid.UUID,
    purpose: CodePurpose,
) -> str | None:
    """Create a fresh code (replacing any live one) and email it.

    The plaintext code exists only here and in the email. Returns it so tests
    can use it; callers in production ignore it.
    """
    user = (
        await session.execute(select(User).where(User.id == user_id).with_for_update(key_share=True))
    ).scalar_one_or_none()
    if user is None:
        return None
    eligible = user.status is UserStatus.pending if purpose is CodePurpose.verify_email else can_reset_password(user)
    if not eligible:
        return None
    code = new_code()
    await session.execute(
        delete(OneTimeCode).where(
            OneTimeCode.user_id == user.id, OneTimeCode.purpose == purpose, OneTimeCode.consumed_at.is_(None)
        )
    )
    await session.execute(
        insert(OneTimeCode).values(
            user_id=user.id,
            purpose=purpose,
            code_hash=code_digest(code_key(settings), user.id, purpose.value, code),
            created_at=now,
            expires_at=now + timedelta(seconds=settings.code_ttl_s),
        )
    )
    email = user.email_normalized
    await session.commit()
    minutes = settings.code_ttl_s // 60
    make = emails.verification_code if purpose is CodePurpose.verify_email else emails.reset_code
    await sender.send(make(email, settings.brand_name, code, minutes))
    return code


async def send_notice(
    session: AsyncSession, settings: Settings, sender: EmailSender, user_id: uuid.UUID, notice: Notice
) -> None:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return
    make = {
        Notice.signup_attempt: emails.signup_attempt,
        Notice.password_changed: emails.password_changed,
        Notice.password_locked: emails.password_locked,
    }[notice]
    await sender.send(make(user.email_normalized, settings.brand_name))
