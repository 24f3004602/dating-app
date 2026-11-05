"""Blocking, unmatching and reporting (F06, D079-D080).

Blocking, in one transaction:
1. the pair advisory lock that likes take (D071): a block and a like that
   would create a match are serialised, so neither can miss the other;
2. insert the block (idempotent);
3. close the pair's open match under the match row lock that sends take;
4. drop today's introductions between them.
Every read path already refuses a blocked pair; this makes the state tidy
and tells both apps the match is gone (`match.closed`, no reason given, so
a block looks the same as an unmatch to the other person).

Anyone may be blocked by ID, and an unknown ID gets the same answer: the
endpoint reveals nothing about who exists.

Reports need a connection to the person (introduced, liked or passed either
way, matched, or blocked by the reporter), which keeps strangers from
mass-reporting arbitrary accounts. A reported message is copied into the
report: that copy is the only message text staff see.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import and_, delete, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.audit.service import record
from app.modules.discovery.models import Block, DailyPick, Interaction, Match, MatchCloseReason
from app.modules.matching.service import close_open_match, ordered, pair_lock_key
from app.modules.media.models import Photo
from app.modules.messaging.models import Message
from app.modules.profiles.models import Profile
from app.modules.safety.models import Report, ReportReason, ReportStatus
from app.modules.safety.schemas import BlockedOut, ReportIn, ReportOut
from app.ratelimit import Limit

BLOCK_LIMIT = Limit("blocks", 60, 3600)
REPORT_LIMIT = Limit("reports", 20, 86400)
UNMATCH_LIMIT = Limit("unmatches", 60, 3600)

PRIORITY = {
    ReportReason.underage: 1,
    ReportReason.explicit: 2,
    ReportReason.harassment: 2,
    ReportReason.hate: 2,
    ReportReason.scam: 2,
    ReportReason.fake: 3,
    ReportReason.other: 3,
}


async def _block(session: AsyncSession, me: uuid.UUID, target: uuid.UUID, now: datetime) -> Match | None:
    """Within the caller's transaction. Returns the match it closed, if any."""
    await session.execute(select(func.pg_advisory_xact_lock(pair_lock_key(me, target))))
    await session.execute(
        pg_insert(Block).values(blocker_id=me, blocked_id=target, created_at=now).on_conflict_do_nothing()
    )
    closed = await close_open_match(session, me, target, MatchCloseReason.blocked, now)
    await session.execute(
        delete(DailyPick).where(
            or_(
                and_(DailyPick.viewer_id == me, DailyPick.candidate_id == target),
                and_(DailyPick.viewer_id == target, DailyPick.candidate_id == me),
            )
        )
    )
    record(session, "block.created", actor=me, target_type="user", target_id=target)
    return closed


async def block(session: AsyncSession, me: uuid.UUID, target: uuid.UUID, now: datetime) -> Match | None:
    if target == me:
        raise ApiError(422, "invalid_target", "You can't block yourself.")
    if await session.get(User, target) is None:
        await session.commit()
        return None  # the same answer as a real block: existence is not revealed
    closed = await _block(session, me, target, now)
    await session.commit()
    return closed


async def unblock(session: AsyncSession, me: uuid.UUID, target: uuid.UUID) -> None:
    """A closed match is not restored."""
    gone = await session.execute(delete(Block).where(Block.blocker_id == me, Block.blocked_id == target))
    if gone.rowcount:  # type: ignore[attr-defined]
        record(session, "block.removed", actor=me, target_type="user", target_id=target)
    await session.commit()


async def my_blocks(session: AsyncSession, me: uuid.UUID) -> list[BlockedOut]:
    rows = (
        await session.execute(
            select(Block.blocked_id, Block.created_at, Profile.display_name)
            .outerjoin(Profile, Profile.user_id == Block.blocked_id)
            .where(Block.blocker_id == me)
            .order_by(Block.created_at.desc())
        )
    ).all()
    return [BlockedOut(user_id=r[0], blocked_at=r[1], display_name=r[2]) for r in rows]


async def unmatch(session: AsyncSession, me: uuid.UUID, match_id: uuid.UUID, now: datetime) -> Match:
    match = (
        await session.execute(
            select(Match).where(Match.id == match_id, or_(Match.user_a_id == me, Match.user_b_id == me))
        )
    ).scalar_one_or_none()
    closed = None
    if match is not None:
        closed = await close_open_match(session, match.user_a_id, match.user_b_id, MatchCloseReason.unmatched, now)
    if closed is None:
        raise ApiError(404, "not_found")
    record(session, "match.unmatched", actor=me, target_type="match", target_id=closed.id)
    await session.commit()
    return closed


async def _connected(session: AsyncSession, me: uuid.UUID, other: uuid.UUID) -> bool:
    """Any sign the reporter has come across this person."""
    a, b = ordered(me, other)
    checks = (
        exists().where(DailyPick.viewer_id == me, DailyPick.candidate_id == other),
        exists().where(
            or_(
                and_(Interaction.actor_id == me, Interaction.target_id == other),
                and_(Interaction.actor_id == other, Interaction.target_id == me),
            )
        ),
        exists().where(Match.user_a_id == a, Match.user_b_id == b),
        exists().where(Block.blocker_id == me, Block.blocked_id == other),
    )
    return bool((await session.execute(select(or_(*checks)))).scalar_one())


async def report(session: AsyncSession, me: uuid.UUID, data: ReportIn, now: datetime) -> tuple[ReportOut, Match | None]:
    """Returns the report and the match a block closed, if any."""
    if data.subject_id == me:
        raise ApiError(422, "invalid_target", "You can't report yourself.")
    if not await _connected(session, me, data.subject_id):
        raise ApiError(404, "not_found")

    evidence = None
    if data.message_id is not None:
        a, b = ordered(me, data.subject_id)
        msg = (
            await session.execute(
                select(Message)
                .join(Match, Match.id == Message.match_id)
                .where(
                    Message.id == data.message_id,
                    Message.sender_id == data.subject_id,
                    Match.user_a_id == a,
                    Match.user_b_id == b,
                )
            )
        ).scalar_one_or_none()
        if msg is None:
            raise ApiError(422, "invalid_report_item", "Choose one of their messages to you.")
        evidence = msg.body
    if data.photo_id is not None:
        photo = await session.get(Photo, data.photo_id)
        if photo is None or photo.user_id != data.subject_id:
            raise ApiError(422, "invalid_report_item", "Choose one of their photos.")

    row = Report(
        reporter_id=me,
        subject_id=data.subject_id,
        reason=data.reason,
        details=data.details,
        message_id=data.message_id,
        evidence_text=evidence,
        photo_id=data.photo_id,
        priority=PRIORITY[data.reason],
        status=ReportStatus.open,
        created_at=now,
    )
    session.add(row)
    await session.flush()
    record(session, "report.created", actor=me, target_type="report", target_id=row.id, reason=data.reason.value)
    closed = await _block(session, me, data.subject_id, now) if data.block else None
    await session.commit()
    name = await session.scalar(select(Profile.display_name).where(Profile.user_id == data.subject_id))
    return _report_out(row, name), closed


def _report_out(row: Report, subject_name: str | None) -> ReportOut:
    about = "message" if row.message_id or row.evidence_text else "photo" if row.photo_id else "profile"
    return ReportOut(
        id=row.id, reason=row.reason, about=about, subject_name=subject_name, status=row.status,
        created_at=row.created_at,
    )  # fmt: skip


async def my_reports(session: AsyncSession, me: uuid.UUID) -> list[ReportOut]:
    rows = (
        await session.execute(
            select(Report, Profile.display_name)
            .outerjoin(Profile, Profile.user_id == Report.subject_id)
            .where(Report.reporter_id == me)
            .order_by(Report.created_at.desc())
            .limit(100)
        )
    ).all()
    return [_report_out(r, name) for r, name in rows]
