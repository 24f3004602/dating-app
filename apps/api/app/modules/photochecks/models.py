"""Photo checks for the blue tick (stage 29b, D164).

A member takes a selfie making a gesture the server chose; our staff compare it with the
member's photos. Approval sets `profiles.photo_verified_at` (the tick); adding a photo clears it.
The selfie exists only while it waits for a decision: deleted then, or when nobody decided in
time. No face recognition: people look, nothing measures faces.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CheckState(enum.StrEnum):
    awaiting = "awaiting"  # a gesture was given; no selfie yet
    pending = "pending"  # the selfie waits for our staff
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"  # the member added a photo while it waited
    expired = "expired"  # the gesture's time ran out, or nobody decided in time


class Gesture(enum.StrEnum):
    thumbs_up = "thumbs_up"
    two_fingers = "two_fingers"
    three_fingers = "three_fingers"
    open_palm = "open_palm"
    hand_on_head = "hand_on_head"
    chin_on_hand = "chin_on_hand"


class RejectReason(enum.StrEnum):
    face_mismatch = "face_mismatch"  # not the person in the photos
    gesture_missing = "gesture_missing"  # not the gesture asked for
    unclear = "unclear"  # the face or the gesture can't be seen


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class PhotoCheck(Base):
    __tablename__ = "photo_checks"
    __table_args__ = (
        # The selfie exists only while it waits for a decision.
        CheckConstraint("(state = 'pending') = (storage_key IS NOT NULL)", name="selfie_while_pending"),
        CheckConstraint(
            "(state = 'awaiting' AND submitted_at IS NULL)"
            " OR (state IN ('pending', 'approved', 'rejected', 'cancelled') AND submitted_at IS NOT NULL)"
            " OR state = 'expired'",
            name="submitted",
        ),
        CheckConstraint("(state IN ('approved', 'rejected')) = (decided_at IS NOT NULL)", name="decided"),
        CheckConstraint("(state = 'rejected') = (reason IS NOT NULL)", name="reason_when_rejected"),
        # One open check a member: a gesture given, or a selfie waiting.
        Index(
            "uq_photo_checks_open", "user_id", unique=True, postgresql_where=text("state IN ('awaiting', 'pending')")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    gesture: Mapped[Gesture] = mapped_column(_enum(Gesture, "gesture"))
    state: Mapped[CheckState] = mapped_column(_enum(CheckState, "state"))
    # Random base for the selfie's object keys (as photos'); carries no user information.
    storage_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime]
    submitted_at: Mapped[datetime | None]
    decided_at: Mapped[datetime | None]
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[RejectReason | None] = mapped_column(_enum(RejectReason, "reason"))
