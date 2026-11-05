"""Account deletion and retention (stage 12, D083-D085).

Deletion, in three steps:

1. **Request** (`request_deletion`, with the password): the account is hidden
   everywhere at once (every read already treats `deletion_requested_at` as
   unavailable), every session is revoked, its realtime connections close,
   open matches end (the other person's chat closes live) and it leaves
   everyone's daily set. Signing in during the grace period offers to keep
   the account; matches that ended stay ended.
2. **Grace period** (7 days). While the account is the subject of an open
   report, the purge waits, at most 30 more days, so deleting it can't erase
   evidence before moderators look.
3. **Purge** (`purge_due_accounts`, hourly): one transaction per account. A
   dated record keeps the accepted document versions for a year (and, for a
   banned account only, a keyed hash of its email); photo files are queued
   for deletion in the same transaction; then the user row is deleted and
   the database cascades to everything else. Reports keep their copy of a
   reported message and lose the link to the person (SET NULL); moderation
   records and the audit trail keep IDs only.

`sweep` applies the other retention rules (`retention.py`). Neither step
reaches backups (they age out on the provider's schedule) or emails that were
already delivered, and the docs say so.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, and_, delete, exists, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.errors import ApiError
from app.jobs import JobQueue
from app.modules.accounts.models import Consent, User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.audit.service import record
from app.modules.auth.crypto import banned_email_digest
from app.modules.auth.models import OneTimeCode, Session
from app.modules.auth.service import AuthContext, banned_email_key, local_today, revoke_all_sessions
from app.modules.billing import service as billing
from app.modules.discovery.models import DailyPick, Match, MatchCloseReason
from app.modules.matching.service import close_all_open_matches
from app.modules.media.service import DELETE_OBJECTS, list_photos
from app.modules.privacy import retention
from app.modules.privacy.models import DeletedAccount
from app.modules.safety.models import ActionKind, ModerationAction, Report, ReportStatus
from app.modules.staff.models import StaffEnrollment
from app.providers.storage import photo_keys
from app.ratelimit import Limit

DELETE_LIMIT = Limit("account_delete", 5, 3600)
PURGE_BATCH = 100
ACTIVE_REPORT = (ReportStatus.open, ReportStatus.in_review)


# --- 1. the request ---------------------------------------------------------------


@dataclass
class DeletionRequested:
    purge_after: datetime
    closed: list[Match] = field(default_factory=list)


async def request_deletion(
    ctx: AuthContext, session: AsyncSession, user_id: uuid.UUID, password: str
) -> DeletionRequested:
    now = ctx.clock()
    await ctx.limiter.hit(DELETE_LIMIT, str(user_id))
    user = (await session.execute(select(User).where(User.id == user_id).with_for_update(key_share=True))).scalar_one()
    if not ctx.passwords.verify(user.password_hash, password):
        record(session, "account.deletion_password_failed", actor=user.id, target_type="user", target_id=user.id)
        await session.commit()
        raise ApiError(403, "password_incorrect", "That password isn't right.")

    user.status = UserStatus.deactivated
    user.deletion_requested_at = now
    await revoke_all_sessions(session, user.id, now)
    await billing.cancel_for_deletion(session, ctx.jobs, user.id)  # never charge someone who is leaving
    closed = await close_all_open_matches(session, user.id, MatchCloseReason.deleted, now)
    await session.execute(
        delete(DailyPick).where(or_(DailyPick.candidate_id == user.id, DailyPick.viewer_id == user.id))
    )
    record(session, "account.deletion_requested", actor=user.id, target_type="user", target_id=user.id)
    await session.commit()
    return DeletionRequested(purge_after=now + retention.ACCOUNT_GRACE, closed=closed)


# --- 2. which accounts are due ------------------------------------------------------


def _due(now: datetime) -> ColumnElement[bool]:
    """Requested and past the grace period, or banned long enough; either way not
    held by an open report, unless the hold has run out."""
    open_report = exists().where(Report.subject_id == User.id, Report.status.in_(ACTIVE_REPORT))
    requested_cutoff = now - retention.ACCOUNT_GRACE
    requested = and_(
        User.deletion_requested_at <= requested_cutoff,
        or_(~open_report, User.deletion_requested_at <= requested_cutoff - retention.REPORT_HOLD_MAX),
    )
    last_ban_change = (
        select(func.max(ModerationAction.created_at))
        .where(
            ModerationAction.target_user_id == User.id,
            ModerationAction.action.in_((ActionKind.ban, ActionKind.reinstate)),
        )
        .scalar_subquery()
    )
    banned_cutoff = now - retention.BANNED_ACCOUNT
    banned = and_(
        User.status == UserStatus.banned,
        last_ban_change <= banned_cutoff,
        or_(~open_report, last_ban_change <= banned_cutoff - retention.REPORT_HOLD_MAX),
    )
    return or_(requested, banned)


async def due_accounts(session: AsyncSession, now: datetime, limit: int = PURGE_BATCH) -> list[uuid.UUID]:
    rows = await session.execute(select(User.id).where(_due(now)).order_by(User.id).limit(limit))
    return list(rows.scalars())


# --- 3. the purge -------------------------------------------------------------------


async def purge_account(
    session: AsyncSession, settings: Settings, jobs: JobQueue, user_id: uuid.UUID, now: datetime
) -> bool:
    """Purge one account if it is still due (re-checked under the row lock, so a
    restore that commits first wins). Commits. Returns whether it was purged."""
    user = (
        await session.execute(select(User).where(User.id == user_id, _due(now)).with_for_update(skip_locked=True))
    ).scalar_one_or_none()
    if user is None:
        await session.rollback()
        return False

    was_banned = user.status is UserStatus.banned
    consents = (
        await session.execute(select(Consent).where(Consent.user_id == user.id).order_by(Consent.granted_at))
    ).scalars()
    session.add(
        DeletedAccount(
            user_id=user.id,
            requested_at=user.deletion_requested_at,
            deleted_at=now,
            was_banned=was_banned,
            email_digest=banned_email_digest(banned_email_key(settings), user.email_normalized) if was_banned else None,
            consents=[
                {
                    "kind": c.kind.value,
                    "version": c.version,
                    "granted_at": c.granted_at.isoformat(),
                    "withdrawn_at": c.withdrawn_at.isoformat() if c.withdrawn_at else None,
                }
                for c in consents
            ],
            keep_until=now + retention.DELETED_ACCOUNT_RECORD,
        )
    )
    keys = [key for photo in await list_photos(session, user.id) for key in photo_keys(photo.storage_key).values()]
    if keys:
        # In this transaction: if the purge commits, the files go too (retried by the worker).
        await jobs.defer(session, DELETE_OBJECTS, keys=keys)
    # The database cascades to sessions, codes, consents, profile, prompts,
    # photos, preferences, picks, likes, matches, messages, read pointers and
    # blocks; reports keep their copy and lose the link (SET NULL).
    await session.execute(delete(User).where(User.id == user.id))
    record(
        session, "account.purged", actor=None, target_type="user", target_id=user.id,
        reason="banned" if was_banned else "requested", photos=len(keys) // 2,
    )  # fmt: skip
    await session.commit()
    return True


async def purge_due_accounts(
    factory: async_sessionmaker[AsyncSession], settings: Settings, jobs: JobQueue, now: datetime
) -> int:
    async with factory() as session:
        due = await due_accounts(session, now)
    purged = 0
    for user_id in due:
        async with factory() as session:
            purged += await purge_account(session, settings, jobs, user_id, now)
    return purged


# --- the retention sweep ------------------------------------------------------------


async def _count(session: AsyncSession, stmt: object) -> int:
    result = await session.execute(stmt)  # type: ignore[call-overload]
    return int(result.rowcount or 0)


async def sweep(session: AsyncSession, settings: Settings, now: datetime) -> dict[str, int]:
    """Apply the retention rules that don't involve whole accounts being
    requested for deletion. One transaction; commits. Returns counts per rule
    (also written to the audit trail, as counts only)."""
    counts: dict[str, int] = {}
    # Conversations 30 days after the match ended; messages and read pointers cascade.
    counts["closed_matches"] = await _count(
        session, delete(Match).where(Match.closed_at < now - retention.CLOSED_CONVERSATION)
    )
    oldest_pick = local_today(settings, now) - timedelta(days=retention.DAILY_PICKS_DAYS)
    counts["daily_picks"] = await _count(session, delete(DailyPick).where(DailyPick.pick_date < oldest_pick))
    ended = now - retention.ENDED_SESSION
    counts["sessions"] = await _count(
        session, delete(Session).where(or_(Session.expires_at < ended, Session.revoked_at < ended))
    )
    counts["codes"] = await _count(
        session, delete(OneTimeCode).where(OneTimeCode.expires_at < now - retention.EXPIRED_CODE)
    )
    counts["payment_events"] = await billing.purge_events(session, now)
    ended_token = now - retention.ENDED_ENROLLMENT
    counts["staff_enrollments"] = await _count(
        session,
        delete(StaffEnrollment).where(
            or_(StaffEnrollment.used_at < ended_token, StaffEnrollment.expires_at < ended_token)
        ),
    )
    expired = (
        (
            await session.execute(
                delete(User)
                .where(User.status == UserStatus.pending, User.created_at < now - retention.UNVERIFIED_ACCOUNT)
                .returning(User.id)
            )
        )
        .scalars()
        .all()
    )
    for user_id in expired:
        record(session, "account.expired_unverified", actor=None, target_type="user", target_id=user_id)
    counts["unverified_accounts"] = len(expired)
    counts["reports"] = await _count(
        session, delete(Report).where(Report.resolved_at < now - retention.RESOLVED_REPORT)
    )
    counts["reporter_links"] = await _count(
        session,
        update(Report)
        .where(Report.resolved_at < now - retention.REPORTER_LINK, Report.reporter_id.is_not(None))
        .values(reporter_id=None),
    )
    counts["deleted_account_records"] = await _count(
        session, delete(DeletedAccount).where(DeletedAccount.keep_until < now)
    )
    # Audit trail and moderation records: 3 years, by a function that only the
    # schema owner could change (the app can't delete recent records).
    counts["audit_records"] = int((await session.execute(text("SELECT app_purge_expired_records()"))).scalar_one())
    if any(counts.values()):
        session.add(AuditLog(actor_id=None, action="retention.swept", details=dict(counts)))  # counts only
    await session.commit()
    return counts
