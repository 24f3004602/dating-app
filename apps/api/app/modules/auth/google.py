"""Sign in with Google (D134, the owner's request, 2026-11-19).

- **Who it is:** Google's ID token, checked on this server (providers/google.py), names a
  Google account (`sub`) and an email Google has verified.
- **A linked account** (`user_identities`) signs in by the same rules as a password
  sign-in: suspended, banned or waiting-to-be-deleted accounts get the same answers.
- **An existing account with that email** is linked on first use when Google is the
  address's own provider (Gmail, or a Workspace domain): it vouches the person holds
  the address now, which is what our own sign-up code proves. Any other address Google
  only verified once, so the account's password is asked for instead. An unfinished
  sign-up (never verified) doesn't count: its password could be anyone's, so it gives
  way to the Google account, never the other way round.
- **Someone new** gets a short-lived signed ticket, and finishes like any sign-up: a
  date of birth (18 and over, the age gate) and the current documents. The account has
  no password ("Forgot your password?" sets one); the email is verified by Google.
- **Deleting an account** that signs in with Google (it may have no password) is
  confirmed with Google's answer again: the same Google account, signed in just now.
- Rate limited per IP; every step is in the audit log. No Google token is kept.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.modules.accounts.models import (
    UNUSABLE_PASSWORD,
    Consent,
    ConsentKind,
    User,
    UserIdentity,
    UserRole,
    UserStatus,
)
from app.modules.auth.crypto import derive_key
from app.modules.auth.schemas import GoogleCompleteIn, GoogleProofIn, GoogleSignInIn, GoogleSignInOut, SessionOut
from app.modules.auth.service import (
    ADULT_AGE,
    MAX_AGE,
    AuthContext,
    _audit,
    _open_session,
    _user_by_email,
    age_on,
    deletion_pending,
    email_barred,
    invited,
    local_today,
    me_out,
    purge_after,
)
from app.providers.google import GoogleIdentity, GoogleSignIn, GoogleTokenError, GoogleUnavailableError
from app.ratelimit import Limit

PROVIDER = "google"
TICKET_TTL = timedelta(minutes=15)
CONFIRM_MAX_AGE_S = 600  # a confirmation is a Google sign-in from the last ten minutes
GOOGLE_IP = Limit("google_sign_in", 30, 3600)


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _ticket_key(ctx: AuthContext) -> bytes:
    return derive_key(ctx.settings.app_secret_key.get_secret_value(), "google-ticket")


def make_ticket(ctx: AuthContext, identity: GoogleIdentity, now: datetime) -> str:
    """Who Google said it was, signed and short-lived, for finishing the sign-up."""
    payload = {"sub": identity.subject, "email": identity.email, "name": identity.name,
               "exp": int((now + TICKET_TTL).timestamp())}  # fmt: skip
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_ticket_key(ctx), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_ticket(ctx: AuthContext, ticket: str, now: datetime) -> GoogleIdentity:
    body, _, sig = ticket.partition(".")
    expected = _b64(hmac.new(_ticket_key(ctx), body.encode(), hashlib.sha256).digest())
    invalid = ApiError(400, "google_ticket_invalid", "This sign-up took too long. Continue with Google again.")
    if not sig or not hmac.compare_digest(sig, expected):
        raise invalid
    try:
        payload = json.loads(_unb64(body))
        if int(payload["exp"]) < now.timestamp():
            raise invalid
        return GoogleIdentity(
            subject=str(payload["sub"]), email=str(payload["email"]), email_verified=True,
            name=payload.get("name") if isinstance(payload.get("name"), str) else None,
        )  # fmt: skip
    except (ValueError, KeyError, TypeError) as exc:
        raise invalid from exc


async def _linked_user(session: AsyncSession, subject: str) -> tuple[User, UserIdentity] | None:
    row = (
        await session.execute(
            select(User, UserIdentity)
            .join(UserIdentity, UserIdentity.user_id == User.id)
            .where(UserIdentity.provider == PROVIDER, UserIdentity.subject == subject)
            .with_for_update(of=User, key_share=True)
        )
    ).first()
    return (row[0], row[1]) if row else None


def _may_sign_in(session: AsyncSession, user: User, *, restore: bool) -> None:
    """The same answers as a password sign-in (service.login)."""
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


async def _who(
    ctx: AuthContext, google: GoogleSignIn, data: GoogleProofIn, *, max_age_s: int | None = None
) -> GoogleIdentity:
    try:
        if data.id_token is not None:
            return await google.verify_id_token(data.id_token, max_age_s=max_age_s)
        redirect = ctx.settings.google_redirect_uri
        if redirect is None or data.code is None or data.code_verifier is None:
            raise GoogleUnavailableError("the web app's Google sign-in is not set up")
        return await google.exchange_code(data.code, data.code_verifier, redirect)
    except GoogleUnavailableError as exc:
        raise ApiError(503, "google_unavailable", "Google sign-in isn't available right now.") from exc
    except GoogleTokenError as exc:
        raise ApiError(401, "google_invalid", "That Google sign-in didn't work. Please try again.") from exc


def _session_out(
    ctx: AuthContext, session: AsyncSession, user: User, now: datetime, user_agent: str | None
) -> SessionOut:
    token, expires = _open_session(session, ctx.settings, user, now, user_agent)
    return SessionOut(token=token, expires_at=expires, user=me_out(user, ctx.settings, now))


async def sign_in(
    ctx: AuthContext,
    session: AsyncSession,
    google: GoogleSignIn,
    data: GoogleSignInIn,
    *,
    ip: str,
    user_agent: str | None,
) -> GoogleSignInOut:
    now = ctx.clock()
    await ctx.limiter.hit(GOOGLE_IP, ip)
    identity = await _who(ctx, google, data)
    linked = await _linked_user(session, identity.subject)
    if linked is not None:
        user, link = linked
        _may_sign_in(session, user, restore=data.restore)
        link.last_used_at = now
        _audit(session, "auth.google_login", user.id, actor=user.id)
        out = _session_out(ctx, session, user, now, user_agent)
        await session.commit()
        return GoogleSignInOut(session=out)
    if not identity.email_verified:
        raise ApiError(403, "google_email_unverified", "Your Google account's email address isn't verified yet.")
    existing = await _user_by_email(session, identity.email, lock=True)
    if existing is not None and existing.status is not UserStatus.pending:
        if not identity.email_authoritative:
            raise ApiError(
                409, "google_link_refused",
                "This email address already has an account. Sign in with your email and password.",
            )  # fmt: skip
        # The address is theirs (Google is its provider): link this Google account and sign in.
        _may_sign_in(session, existing, restore=data.restore)
        session.add(UserIdentity(provider=PROVIDER, subject=identity.subject, user_id=existing.id,
                                 created_at=now, last_used_at=now))  # fmt: skip
        _audit(session, "auth.google_linked", existing.id, actor=existing.id)
        out = _session_out(ctx, session, existing, now, user_agent)
        await session.commit()
        return GoogleSignInOut(session=out)
    await session.commit()
    return GoogleSignInOut(ticket=make_ticket(ctx, identity, now), email=identity.email, name=identity.name)


async def confirms(
    ctx: AuthContext, session: AsyncSession, google: GoogleSignIn, proof: GoogleProofIn, user_id: uuid.UUID
) -> bool:
    """Google's answer again, for a step that asks who it is (deleting the account): the
    Google account linked to this one, signed in within the last ten minutes."""
    identity = await _who(ctx, google, proof, max_age_s=CONFIRM_MAX_AGE_S)
    linked = await session.execute(
        select(UserIdentity.user_id).where(UserIdentity.provider == PROVIDER, UserIdentity.subject == identity.subject)
    )
    return linked.scalar_one_or_none() == user_id


async def complete(
    ctx: AuthContext, session: AsyncSession, data: GoogleCompleteIn, ip: str, user_agent: str | None
) -> SessionOut:
    s = ctx.settings
    now = ctx.clock()
    await ctx.limiter.hit(GOOGLE_IP, ip)
    identity = read_ticket(ctx, data.ticket, now)
    today = local_today(s, now)
    if data.birthdate > today or age_on(data.birthdate, today) > MAX_AGE:
        raise ApiError(422, "invalid_birthdate", "Enter your real date of birth.")
    if age_on(data.birthdate, today) < ADULT_AGE:
        raise ApiError(422, "underage", f"You must be {ADULT_AGE} or older to join.")
    if data.consents.terms != s.terms_version or data.consents.privacy != s.privacy_version:
        raise ApiError(
            422, "consent_required", "Accept the current terms and privacy notice to continue.",
            extra={"required": {"terms": s.terms_version, "privacy": s.privacy_version}},
        )  # fmt: skip
    if await email_barred(session, s, identity.email, now):
        _audit(session, "auth.register_barred", None)
        await session.commit()
        raise ApiError(403, "signup_unavailable", "An account can't be made with this address. Contact support.")
    if s.signup_invite_only and not await invited(session, s, identity.email, now):
        raise ApiError(403, "not_invited", "Sign-up is by invitation for now.")

    # Sent twice, or finished in another tab: the account exists, so sign in.
    linked = await _linked_user(session, identity.subject)
    if linked is not None:
        _may_sign_in(session, linked[0], restore=False)
        out = _session_out(ctx, session, linked[0], now, user_agent)
        await session.commit()
        return out
    existing = await _user_by_email(session, identity.email, lock=True)
    if existing is not None and existing.status is not UserStatus.pending:
        raise ApiError(409, "account_exists", "An account with this address exists now. Continue with Google again.")
    if existing is not None:
        # An unfinished sign-up with this address never proved it; the Google account has.
        await session.execute(delete(User).where(User.id == existing.id))
        _audit(session, "auth.unverified_signup_replaced", None)

    user = User(
        email_normalized=identity.email, password_hash=UNUSABLE_PASSWORD, birthdate=data.birthdate,
        status=UserStatus.active, role=UserRole.member, email_verified_at=now, last_active_at=now,
        created_at=now, updated_at=now,
    )  # fmt: skip
    session.add(user)
    await session.flush()
    for kind, version in ((ConsentKind.terms, s.terms_version), (ConsentKind.privacy, s.privacy_version)):
        session.add(Consent(user_id=user.id, kind=kind, version=version, granted_at=now))
    session.add(UserIdentity(provider=PROVIDER, subject=identity.subject, user_id=user.id,
                             created_at=now, last_used_at=now))  # fmt: skip
    _audit(session, "auth.google_signup", user.id, actor=user.id)
    out = _session_out(ctx, session, user, now, user_agent)
    await session.commit()
    return out
