"""Discreet notifications (stage 16, D093).

Pushes say only that something happened: "You have a new message", never who
or what. They carry a kind, and no IDs, names or text. A member can switch off
matches, messages and likes; notices from the team are always delivered, and
always shown in the app as well.

Flow: an event commits (a match, a message, a like, a warning), then the router
asks for a push (`request_push`). A throttle in Redis keeps a busy chat from
buzzing the phone each time, and the job runs on the worker (`send_push`). The
worker sends to the member's devices whose session is still live, records the
tickets, drops tokens Expo calls dead, and later checks receipts. Pushes are
best effort: a failure here never fails the event that caused it.
"""

from __future__ import annotations

import enum
import logging
import uuid
from datetime import datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.jobs import JobQueue
from app.modules.accounts.models import User, UserStatus
from app.modules.auth.models import Session, SessionClient
from app.modules.notifications.models import (
    MemberNotice,
    NoticeKind,
    NotificationPrefs,
    Platform,
    PushDevice,
    PushTicket,
)
from app.modules.notifications.schemas import NoticeOut, PrefsBody, PushDeviceIn
from app.providers.push import PushMessage, PushSender
from app.ratelimit import Limit

logger = logging.getLogger(__name__)

SEND_PUSH = "notify:send"
DEVICE_LIMIT = Limit("push_device", 20, 3600)
RECEIPT_DELAY = timedelta(minutes=15)  # Expo: check receipts about 15 minutes after sending
TICKET_LIFE = timedelta(hours=24)  # Expo clears receipts after a day


class Kind(enum.StrEnum):
    match = "match"
    message = "message"
    like = "like"
    notice = "notice"


# The whole text of every push. Discreet by default (fixes.md differentiator 7).
TEXT = {
    Kind.match: "You have a new match.",
    Kind.message: "You have a new message.",
    Kind.like: "Someone liked you.",
    Kind.notice: "You have a notice from the team.",
}
# At most one push per window (seconds) for the same thing.
THROTTLE = {Kind.message: 600, Kind.like: 3600}


# --- the member's side ---------------------------------------------------------------


async def register_device(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, data: PushDeviceIn, now: datetime
) -> None:
    """This session's phone. A token seen under another session moves here (the
    phone changed hands or the app was reinstalled)."""
    await session.execute(delete(PushDevice).where(PushDevice.token == data.token, PushDevice.session_id != session_id))
    await session.execute(
        pg_insert(PushDevice)
        .values(session_id=session_id, user_id=user_id, token=data.token, platform=Platform(data.platform),
                last_seen_at=now, created_at=now)
        .on_conflict_do_update(
            index_elements=[PushDevice.session_id],
            set_={"token": data.token, "platform": Platform(data.platform), "last_seen_at": now},
        )
    )  # fmt: skip
    await session.commit()


async def remove_device(session: AsyncSession, session_id: uuid.UUID) -> None:
    await session.execute(delete(PushDevice).where(PushDevice.session_id == session_id))
    await session.commit()


async def get_prefs(session: AsyncSession, user_id: uuid.UUID) -> PrefsBody:
    row = await session.get(NotificationPrefs, user_id)
    if row is None:
        return PrefsBody(matches=True, messages=True, likes=True)
    return PrefsBody(matches=row.matches, messages=row.messages, likes=row.likes)


async def set_prefs(session: AsyncSession, user_id: uuid.UUID, data: PrefsBody, now: datetime) -> PrefsBody:
    values = {"matches": data.matches, "messages": data.messages, "likes": data.likes, "updated_at": now}
    await session.execute(
        pg_insert(NotificationPrefs)
        .values(user_id=user_id, **values)
        .on_conflict_do_update(index_elements=[NotificationPrefs.user_id], set_=values)
    )
    await session.commit()
    return data


async def notices(session: AsyncSession, user_id: uuid.UUID) -> list[NoticeOut]:
    rows = await session.execute(
        select(MemberNotice).where(MemberNotice.user_id == user_id).order_by(MemberNotice.created_at.desc()).limit(50)
    )
    return [
        NoticeOut(id=n.id, kind=n.kind.value, created_at=n.created_at, read=n.read_at is not None)
        for n in rows.scalars()
    ]


async def mark_notice_read(session: AsyncSession, user_id: uuid.UUID, notice_id: uuid.UUID, now: datetime) -> None:
    found = await session.execute(
        update(MemberNotice)
        .where(MemberNotice.id == notice_id, MemberNotice.user_id == user_id, MemberNotice.read_at.is_(None))
        .values(read_at=now)
        .returning(MemberNotice.id)
    )
    if found.first() is None:
        exists = await session.execute(
            select(MemberNotice.id).where(MemberNotice.id == notice_id, MemberNotice.user_id == user_id)
        )
        if exists.first() is None:
            raise ApiError(404, "not_found")
    await session.commit()


def add_notice(session: AsyncSession, user_id: uuid.UUID, kind: NoticeKind, now: datetime) -> None:
    """In the caller's transaction: the notice exists if and only if the action does."""
    session.add(MemberNotice(user_id=user_id, kind=kind, created_at=now))


# --- asking for a push (API side) -----------------------------------------------------


async def request_push(
    session: AsyncSession,
    jobs: JobQueue,
    redis: Redis,
    prefix: str,
    *,
    user_id: uuid.UUID,
    kind: Kind,
    about: uuid.UUID | None = None,
) -> bool:
    """Queue a push after an event has committed. Throttled per member, kind and
    subject (a busy chat pushes once per 10 minutes). Never raises: the event
    already happened, and a push is a courtesy. Returns whether one was queued."""
    try:
        window = THROTTLE.get(kind)
        if window is not None:
            key = f"{prefix}:push:{kind.value}:{user_id}:{about or ''}"
            if not await redis.set(key, "1", nx=True, ex=window):
                return False
        await jobs.defer(session, SEND_PUSH, user_id=str(user_id), kind=kind.value)
        await session.commit()
        return True
    except Exception as exc:
        logger.warning("push not queued", extra={"event": "push.not_queued", "error_type": type(exc).__name__})
        await session.rollback()
        return False


# --- sending (worker side) -------------------------------------------------------------


def _wanted(prefs: PrefsBody, kind: Kind) -> bool:
    return {Kind.match: prefs.matches, Kind.message: prefs.messages, Kind.like: prefs.likes}.get(kind, True)


async def send_push(
    session: AsyncSession, sender: PushSender, brand: str, *, user_id: uuid.UUID, kind: Kind, now: datetime
) -> int:
    """Push one kind of news to every live device of a member. Returns how many were sent."""
    user = await session.get(User, user_id)
    if user is None or user.status is not UserStatus.active or user.deletion_requested_at is not None:
        return 0
    if not _wanted(await get_prefs(session, user_id), kind):
        return 0
    tokens = list(
        (
            await session.execute(
                select(PushDevice.token)
                .join(Session, Session.id == PushDevice.session_id)
                .where(
                    PushDevice.user_id == user_id,
                    Session.client == SessionClient.mobile,
                    Session.revoked_at.is_(None),
                    Session.expires_at > now,
                )
            )
        ).scalars()
    )
    if not tokens:
        return 0
    messages = [PushMessage(to=t, title=brand, body=TEXT[kind], data={"kind": kind.value}) for t in tokens]
    tickets = await sender.send(messages)
    dead = [t.token for t in tickets if t.error == "DeviceNotRegistered"]
    if dead:
        await session.execute(delete(PushDevice).where(PushDevice.token.in_(dead)))
    for t in tickets:
        if t.ok and t.receipt_id:
            session.add(PushTicket(receipt_id=t.receipt_id, token=t.token, created_at=now))
    await session.commit()
    return sum(t.ok for t in tickets)


async def check_receipts(session: AsyncSession, sender: PushSender, now: datetime) -> int:
    """Receipts for tickets older than 15 minutes: dead tokens go, checked tickets
    go, and tickets older than a day go regardless. Returns tokens removed."""
    due = list(
        (
            await session.execute(select(PushTicket).where(PushTicket.created_at <= now - RECEIPT_DELAY).limit(1000))
        ).scalars()
    )
    removed = 0
    if due:
        results = await sender.receipts([t.receipt_id for t in due])
        dead = {t.token for t in due if results.get(t.receipt_id) == "DeviceNotRegistered"}
        if dead:
            stmt = delete(PushDevice).where(PushDevice.token.in_(dead)).returning(PushDevice.token)
            gone = await session.execute(stmt)
            removed = len(gone.all())
        checked = [t.receipt_id for t in due if t.receipt_id in results]
        if checked:
            await session.execute(delete(PushTicket).where(PushTicket.receipt_id.in_(checked)))
    await session.execute(delete(PushTicket).where(PushTicket.created_at <= now - TICKET_LIFE))
    await session.commit()
    return int(removed)
