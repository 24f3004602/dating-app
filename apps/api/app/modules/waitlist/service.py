"""Waitlist flows (stage 20c, D101): join, confirm, leave.

- Double opt-in: nothing is ever sent to an address except its confirmation
  link until its owner confirms, so nobody can sign someone else up for mail.
- No enumeration: joining answers the same for new, waiting and confirmed
  addresses; the email goes out from the worker, never the request.
- Adults only, and the privacy notice shown with the form is recorded:
  both are checked before anything is counted or stored (like sign-up).
- Limits per IP and per address, failing closed (the auth limiter).
- Tokens: the confirmation token is 256 random bits, made by the worker when
  it sends the email, stored as SHA-256, single use, 7 days. The leave link
  is an HMAC of the entry's ID under its own derived key, so every later
  email can carry one without storing it; leaving deletes the entry.
- Job arguments hold only the entry's ID (privacy inventory).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.modules.auth.crypto import derive_key
from app.modules.auth.service import AuthContext
from app.modules.waitlist import emails
from app.modules.waitlist.models import WaitlistEntry
from app.modules.waitlist.schemas import JoinIn
from app.providers.email import EmailSender
from app.ratelimit import Limit

SEND_CONFIRMATION = "waitlist:send_confirmation"
ADULT_AGE = 18
CONFIRM_TTL = timedelta(days=7)
RESEND_AFTER = timedelta(minutes=5)  # a repeat join re-sends the link at most this often

JOIN_IP = Limit("waitlist_ip", 10, 3600)
JOIN_EMAIL = Limit("waitlist_email", 5, 86_400)  # whether or not the address is listed
CONFIRM_IP = Limit("waitlist_confirm_ip", 30, 900)
LEAVE_IP = Limit("waitlist_leave_ip", 30, 900)


def _token_digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def _leave_key(settings: Settings) -> bytes:
    return derive_key(settings.app_secret_key.get_secret_value(), "waitlist-leave")


def leave_token(settings: Settings, entry_id: uuid.UUID) -> str:
    mac = hmac.new(_leave_key(settings), entry_id.bytes, hashlib.sha256).digest()
    return f"{entry_id.hex}.{base64.urlsafe_b64encode(mac).rstrip(b'=').decode()}"


def entry_for_leave_token(settings: Settings, token: str) -> uuid.UUID | None:
    entry_hex, dot, mac = token.partition(".")
    if not dot or len(entry_hex) != 32:
        return None
    try:
        entry_id = uuid.UUID(hex=entry_hex)
    except ValueError:
        return None
    expected = leave_token(settings, entry_id).partition(".")[2]
    return entry_id if hmac.compare_digest(expected.encode(), mac.encode()) else None


def _may_resend(entry: WaitlistEntry, now: datetime) -> bool:
    issued = entry.created_at if entry.confirm_expires_at is None else entry.confirm_expires_at - CONFIRM_TTL
    return issued <= now - RESEND_AFTER


async def join(ctx: AuthContext, session: AsyncSession, data: JoinIn, ip: str) -> None:
    s = ctx.settings
    # Checked first: nothing about a visitor who fails these is stored or counted.
    if not data.adult:
        raise ApiError(422, "underage", f"You must be {ADULT_AGE} or older to join.")
    if data.privacy != s.privacy_version:
        raise ApiError(
            422,
            "consent_required",
            "Read the current privacy notice to continue.",
            extra={"required": {"privacy": s.privacy_version}},
        )
    await ctx.limiter.hit(JOIN_IP, ip)
    await ctx.limiter.hit(JOIN_EMAIL, data.email)
    now = ctx.clock()
    new_id = (
        await session.execute(
            pg_insert(WaitlistEntry)
            .values(email_normalized=data.email, privacy_version=s.privacy_version, created_at=now)
            .on_conflict_do_nothing(index_elements=[WaitlistEntry.email_normalized])
            .returning(WaitlistEntry.id)
        )
    ).scalar_one_or_none()
    if new_id is not None:
        await ctx.jobs.defer(session, SEND_CONFIRMATION, entry_id=str(new_id))
    else:
        entry = (
            await session.execute(
                select(WaitlistEntry).where(WaitlistEntry.email_normalized == data.email).with_for_update()
            )
        ).scalar_one_or_none()
        # Waiting for confirmation: a fresh link, not too often. Confirmed: nothing to do.
        if entry is not None and entry.confirmed_at is None and _may_resend(entry, now):
            entry.privacy_version = s.privacy_version
            await ctx.jobs.defer(session, SEND_CONFIRMATION, entry_id=str(entry.id))
    await session.commit()


async def confirm(ctx: AuthContext, session: AsyncSession, token: str, ip: str) -> None:
    await ctx.limiter.hit(CONFIRM_IP, ip)
    now = ctx.clock()
    entry = (
        await session.execute(
            select(WaitlistEntry).where(WaitlistEntry.confirm_token_hash == _token_digest(token)).with_for_update()
        )
    ).scalar_one_or_none()
    if entry is None or entry.confirm_expires_at is None or entry.confirm_expires_at <= now:
        raise ApiError(400, "invalid_link", "This link has expired or has already been used.")
    entry.confirmed_at = now
    entry.confirm_token_hash = None
    entry.confirm_expires_at = None
    await session.commit()


async def leave(ctx: AuthContext, session: AsyncSession, token: str, ip: str) -> None:
    """Deletes the entry. Answers the same for a bad link: nothing to reveal."""
    await ctx.limiter.hit(LEAVE_IP, ip)
    entry_id = entry_for_leave_token(ctx.settings, token)
    if entry_id is not None:
        await session.execute(delete(WaitlistEntry).where(WaitlistEntry.id == entry_id))
        await session.commit()


async def send_confirmation(
    session: AsyncSession, settings: Settings, sender: EmailSender, *, now: datetime, entry_id: uuid.UUID
) -> str | None:
    """Make a fresh link (replacing any earlier one) and email it.

    The plaintext token exists only here and in the email. Returns it so tests
    can use it; the worker ignores it.
    """
    entry = (
        await session.execute(select(WaitlistEntry).where(WaitlistEntry.id == entry_id).with_for_update())
    ).scalar_one_or_none()
    if entry is None or entry.confirmed_at is not None:
        return None
    token = secrets.token_urlsafe(32)
    entry.confirm_token_hash = _token_digest(token)
    entry.confirm_expires_at = now + CONFIRM_TTL
    email = entry.email_normalized
    await session.commit()
    await sender.send(
        emails.confirm(
            email,
            settings.brand_name,
            confirm_url=f"{settings.site_url}/waitlist/confirm?t={token}",
            leave_url=f"{settings.site_url}/waitlist/leave?t={leave_token(settings, entry_id)}",
            days=CONFIRM_TTL.days,
        )
    )
    return token


async def counts(session: AsyncSession) -> tuple[int, int]:
    """(confirmed, waiting for confirmation): numbers only, for the CLI."""
    row = (
        await session.execute(
            select(
                func.count().filter(WaitlistEntry.confirmed_at.is_not(None)),
                func.count().filter(WaitlistEntry.confirmed_at.is_(None)),
            )
        )
    ).one()
    return int(row[0]), int(row[1])
