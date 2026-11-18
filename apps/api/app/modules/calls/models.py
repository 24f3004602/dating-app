"""Live: random one-to-one video calls between members (stage 23, D123).

- `call_members`: a member's Live state that outlives single calls: the Live
  rules they accepted, and how many of their free calls they've used (this
  count must survive the purge of old call records).
- `call_queue`: members waiting to be paired, with a heartbeat. An entry
  without one for `calls_queue_ttl_s` is ignored, and later swept.
- `calls`: one row per pairing. The two session descriptions are kept only
  while the call is open (cleared when it ends); then when it started,
  connected and ended, and why: for the free allowance, reports and safety
  reviews. Purged after 90 days unless an open report names it.

No audio or video reaches the server: media flows between the two devices,
through a TURN relay on servers people use.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Index, SmallInteger, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


def _enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class CallState(enum.StrEnum):
    connecting = "connecting"  # paired; the two devices are exchanging descriptions
    live = "live"  # a device reported the connection: the clock runs
    ended = "ended"


class CallEndReason(enum.StrEnum):
    hangup = "hangup"  # someone pressed End
    next = "next"  # someone moved on to the next person
    limit = "limit"  # the call's time ran out
    timeout = "timeout"  # it never connected in time
    failed = "failed"  # the connection failed or dropped
    report = "report"  # someone reported the other person
    left = "left"  # an account went away (deletion, suspension, ban)


class CallMember(Base):
    __tablename__ = "call_members"
    __table_args__ = (CheckConstraint("free_calls_used >= 0", name="free_calls_used"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    rules_version: Mapped[str] = mapped_column(String(16))
    rules_accepted_at: Mapped[datetime]
    free_calls_used: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class CallQueueEntry(Base):
    __tablename__ = "call_queue"
    __table_args__ = (Index("ix_call_queue_joined_at", "joined_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # The device (or browser tab) that is waiting: only it takes the call.
    client_id: Mapped[str] = mapped_column(String(36))
    joined_at: Mapped[datetime]
    seen_at: Mapped[datetime]


class Call(CreatedAtMixin, Base):
    """`user_a` waited in the queue and makes the offer; `user_b` joined and answers."""

    __tablename__ = "calls"
    __table_args__ = (
        CheckConstraint("user_a_id <> user_b_id", name="two_people"),
        CheckConstraint("limit_s > 0", name="limit_positive"),
        CheckConstraint("(state = 'ended') = (ended_at IS NOT NULL)", name="ended_consistent"),
        CheckConstraint("(ended_at IS NULL) = (end_reason IS NULL)", name="end_reason_consistent"),
        CheckConstraint("(connected_at IS NULL) = (ends_at IS NULL)", name="ends_at_consistent"),
        Index("ix_calls_user_a_id_created_at", "user_a_id", "created_at"),
        Index("ix_calls_user_b_id_created_at", "user_b_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_a: Mapped[str] = mapped_column(String(36))
    client_b: Mapped[str] = mapped_column(String(36))
    state: Mapped[CallState] = mapped_column(_enum(CallState, "state"))
    # The longest this call may run once connected: the shorter of the two allowances.
    limit_s: Mapped[int] = mapped_column(SmallInteger)
    # Whether each side is on one of their free calls (counted once it connects).
    free_a: Mapped[bool] = mapped_column(Boolean)
    free_b: Mapped[bool] = mapped_column(Boolean)
    # Session descriptions, cleaned of every address but the relay's; cleared at the end.
    offer_sdp: Mapped[str | None] = mapped_column(Text)
    answer_sdp: Mapped[str | None] = mapped_column(Text)
    connected_at: Mapped[datetime | None]
    ends_at: Mapped[datetime | None]
    ended_at: Mapped[datetime | None]
    end_reason: Mapped[CallEndReason | None] = mapped_column(_enum(CallEndReason, "end_reason"))
