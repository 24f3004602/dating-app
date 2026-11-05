"""Messages and read pointers (stage 10, D072).

Each message has a sequence number `n` within its match (1, 2, 3, ...),
assigned under the match row lock, so numbers are gap-free and follow commit
order: a client that has seen up to `n` can never miss an earlier message by
asking for `after=n` (REST catch-up, D025).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class MessageFlag(enum.StrEnum):
    """Set from the nudge word list when a message is stored (D075)."""

    hurtful = "hurtful"
    money = "money"


class Message(CreatedAtMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("match_id", "n"),
        # Idempotent sends: a retry with the same client_message_id is the same message.
        UniqueConstraint("match_id", "sender_id", "client_message_id"),
        CheckConstraint("n >= 1", name="n_positive"),
        CheckConstraint("char_length(body) BETWEEN 1 AND 2000", name="body_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"))
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    n: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(String(2000))
    client_message_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    flag: Mapped[MessageFlag | None] = mapped_column(
        Enum(
            MessageFlag,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="flag",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    # Removed by a moderator (stage 11): kept for the record, shown as removed.
    removed_at: Mapped[datetime | None]


class MatchRead(Base):
    """How far a member has read in a match. Only moves forward. Never shown
    to the other person: there are no read receipts (D072)."""

    __tablename__ = "match_reads"
    __table_args__ = (CheckConstraint("last_read_n >= 0", name="last_read_n"),)

    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    last_read_n: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
