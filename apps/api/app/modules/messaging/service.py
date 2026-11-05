"""One-to-one messages in open matches (F05, D025, D072).

Sending, in one transaction:
1. lock the match row (FOR NO KEY UPDATE): sends in a match are serialised,
   and unmatching and blocking (stage 11) update the same row, so a message
   cannot slip in after either;
2. re-check inside the lock that the match is open, that the other person is
   still available and that neither has blocked the other;
3. a retry with the same `client_message_id` returns the stored message;
4. take the next sequence number, store the message, update the match's
   conversation state and the sender's read pointer.

REST is the source of truth; the router publishes a realtime hint after the
commit. There is no end-to-end encryption: messages are stored on our
servers, readable by the service, and the app must not claim otherwise.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.modules.discovery.models import Match
from app.modules.matching.service import visible_match
from app.modules.messaging import nudge
from app.modules.messaging.models import MatchRead, Message, MessageFlag
from app.modules.messaging.queries import read_pointer, unread_count
from app.modules.messaging.schemas import MessageIn, MessageOut, MessagePage, ReadOut
from app.ratelimit import Limit

SEND_LIMIT = Limit("messages", 300, 3600)
SEND_BURST = Limit("messages_burst", 30, 60)
READ_LIMIT = Limit("message_reads", 1200, 3600)
PAGE_DEFAULT = 30
PAGE_MAX = 50


def message_out(msg: Message, me: uuid.UUID) -> MessageOut:
    mine = msg.sender_id == me
    return MessageOut(
        id=msg.id,
        n=msg.n,
        from_me=mine,
        body=msg.body,
        sent_at=msg.created_at,
        client_message_id=msg.client_message_id if mine else None,
        safety_tip="money" if (not mine and msg.flag is MessageFlag.money) else None,
    )


async def _advance_read(session: AsyncSession, match_id: uuid.UUID, user_id: uuid.UUID, n: int, now: datetime) -> None:
    """Move the read pointer forward to `n` (never back)."""
    stmt = pg_insert(MatchRead).values(match_id=match_id, user_id=user_id, last_read_n=n, updated_at=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=[MatchRead.match_id, MatchRead.user_id],
        set_={"last_read_n": func.greatest(MatchRead.last_read_n, stmt.excluded.last_read_n), "updated_at": now},
    )
    await session.execute(stmt)


async def send(
    session: AsyncSession, me: uuid.UUID, match_id: uuid.UUID, data: MessageIn, now: datetime
) -> tuple[MessageOut, bool, Match]:
    """Returns (message, created, match). A retry returns the original message (created False)."""
    match = await visible_match(session, me, match_id, lock=True)
    existing = (
        await session.execute(
            select(Message).where(
                Message.match_id == match.id,
                Message.sender_id == me,
                Message.client_message_id == data.client_message_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await session.commit()  # releases the lock
        if existing.body != data.body:
            raise ApiError(409, "idempotency_conflict", "That message ID was already used for a different message.")
        return message_out(existing, me), False, match

    n = match.last_message_n + 1
    msg = Message(
        match_id=match.id,
        sender_id=me,
        n=n,
        body=data.body,
        client_message_id=data.client_message_id,
        flag=nudge.flag(data.body),
        created_at=now,
    )
    session.add(msg)
    match.last_message_n = n
    match.last_message_at = now
    match.last_sender_id = me
    await session.flush()
    # Writing a message means having read the conversation up to it.
    await _advance_read(session, match.id, me, n, now)
    await session.commit()
    return message_out(msg, me), True, match


async def history(
    session: AsyncSession,
    me: uuid.UUID,
    match_id: uuid.UUID,
    *,
    before: int | None,
    after: int | None,
    limit: int,
) -> MessagePage:
    """The latest page (neither cursor), older messages (`before`) or newer
    ones (`after`, for catch-up). Items are oldest first."""
    if before is not None and after is not None:
        raise ApiError(422, "invalid_cursor", "Use before or after, not both.")
    match = await visible_match(session, me, match_id)
    stmt = select(Message).where(Message.match_id == match.id)
    if after is not None:
        rows = list(
            (await session.execute(stmt.where(Message.n > after).order_by(Message.n).limit(limit + 1))).scalars()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
    else:
        if before is not None:
            stmt = stmt.where(Message.n < before)
        rows = list((await session.execute(stmt.order_by(Message.n.desc()).limit(limit + 1))).scalars())
        has_more = len(rows) > limit
        rows = list(reversed(rows[:limit]))
    await session.commit()
    return MessagePage(items=[message_out(m, me) for m in rows], has_more=has_more)


async def mark_read(session: AsyncSession, me: uuid.UUID, match_id: uuid.UUID, up_to_n: int, now: datetime) -> ReadOut:
    match = await visible_match(session, me, match_id)
    await _advance_read(session, match.id, me, min(up_to_n, match.last_message_n), now)
    await session.commit()
    read_n = await read_pointer(session, match.id, me)
    return ReadOut(last_read_n=read_n, unread=await unread_count(session, match.id, me, read_n))
