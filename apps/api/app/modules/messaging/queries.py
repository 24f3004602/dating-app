"""Read-side helpers on messages, shared with matching (no service imports here)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.messaging.models import MatchRead, Message


async def read_pointer(session: AsyncSession, match_id: uuid.UUID, user_id: uuid.UUID) -> int:
    found = (
        await session.execute(
            select(MatchRead.last_read_n).where(MatchRead.match_id == match_id, MatchRead.user_id == user_id)
        )
    ).scalar_one_or_none()
    return int(found or 0)


async def unread_count(session: AsyncSession, match_id: uuid.UUID, user_id: uuid.UUID, last_read_n: int) -> int:
    stmt = (
        select(func.count())
        .select_from(Message)
        .where(Message.match_id == match_id, Message.n > last_read_n, Message.sender_id != user_id)
    )
    return int((await session.execute(stmt)).scalar_one())


async def message_at(session: AsyncSession, match_id: uuid.UUID, n: int) -> Message | None:
    return (
        await session.execute(select(Message).where(Message.match_id == match_id, Message.n == n))
    ).scalar_one_or_none()
