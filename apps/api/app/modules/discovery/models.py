"""Discovery tables, plus the interaction and block tables its filters need.

`interactions` (likes and passes) gets its API in stage 9 and `blocks` in
stage 11 (D064); discovery already filters on both, so the rules are tested
from the start.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class Preferences(Base):
    __tablename__ = "preferences"
    __table_args__ = (
        CheckConstraint("age_min BETWEEN 18 AND 99 AND age_max BETWEEN 18 AND 99", name="age_range"),
        CheckConstraint("age_min <= age_max", name="age_order"),
        CheckConstraint("max_distance_km IS NULL OR max_distance_km IN (5, 15, 50)", name="distance_bucket"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    age_min: Mapped[int] = mapped_column(SmallInteger)
    age_max: Mapped[int] = mapped_column(SmallInteger)
    # NULL means any distance.
    max_distance_km: Mapped[int | None] = mapped_column(SmallInteger)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class DailyPick(CreatedAtMixin, Base):
    """Today's finite set for a viewer (D014). Kept 7 days."""

    __tablename__ = "daily_picks"

    viewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    pick_date: Mapped[date] = mapped_column(Date, primary_key=True, index=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    rank: Mapped[int] = mapped_column(SmallInteger)
    distance_bucket: Mapped[str] = mapped_column(String(16))


class InteractionKind(enum.StrEnum):
    like = "like"
    passed = "pass"


class Interaction(CreatedAtMixin, Base):
    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("actor_id", "target_id"),
        CheckConstraint("actor_id <> target_id", name="not_self"),
        CheckConstraint("char_length(comment) <= 150", name="comment_length"),
        Index("ix_interactions_target_kind", "target_id", "kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[InteractionKind] = mapped_column(
        Enum(
            InteractionKind,
            native_enum=False,
            create_constraint=True,
            length=8,
            name="kind",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    comment: Mapped[str | None] = mapped_column(String(150))
    # What a like was about (optional): one of the target's photos, or a prompt.
    target_photo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("photos.id", ondelete="SET NULL"))
    target_prompt_key: Mapped[str | None] = mapped_column(String(32))


class MatchCloseReason(enum.StrEnum):
    unmatched = "unmatched"
    blocked = "blocked"
    deleted = "deleted"
    moderation = "moderation"


class Match(CreatedAtMixin, Base):
    """A mutual like. The pair is stored ordered (a < b) and unique (D024)."""

    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id"),
        CheckConstraint("user_a_id < user_b_id", name="ordered_pair"),
        CheckConstraint("(closed_at IS NULL) = (closed_reason IS NULL)", name="closed_consistent"),
        CheckConstraint("last_message_n >= 0", name="last_message_n"),
        CheckConstraint(
            "(last_message_n = 0) = (last_message_at IS NULL) AND (last_message_at IS NULL) = (last_sender_id IS NULL)",
            name="last_message_consistent",
        ),
        CheckConstraint("last_sender_id IS NULL OR last_sender_id IN (user_a_id, user_b_id)", name="last_sender"),
        # The retention sweep: conversations are purged 30 days after they end.
        Index("ix_matches_closed_at", "closed_at", postgresql_where=text("closed_at IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Conversation state (stage 10), written by each send under the match row
    # lock: the sequence number of the latest message, when, and by whom.
    last_message_n: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    last_message_at: Mapped[datetime | None]
    last_sender_id: Mapped[uuid.UUID | None]
    closed_at: Mapped[datetime | None]
    closed_reason: Mapped[MatchCloseReason | None] = mapped_column(
        Enum(
            MatchCloseReason,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="closed_reason",
            values_callable=lambda e: [m.value for m in e],
        )
    )


class Block(CreatedAtMixin, Base):
    __tablename__ = "blocks"
    __table_args__ = (CheckConstraint("blocker_id <> blocked_id", name="not_self"),)

    blocker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
