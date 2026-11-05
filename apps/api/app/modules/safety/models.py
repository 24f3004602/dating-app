"""Reports and moderation actions (stage 11, D079-D081).

Blocks live in `discovery.models.Block` (the table came first, D064).

Reports keep a copy of a reported message (`evidence_text`), so the evidence
survives when conversations are purged (stage 12), and they outlive both
accounts (foreign keys SET NULL): safety records are kept under the
retention exception (privacy-data-inventory.md). Moderation actions are
append-only, like the audit log, with no foreign keys.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


def _enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class ReportReason(enum.StrEnum):
    fake = "fake"
    harassment = "harassment"
    explicit = "explicit"
    scam = "scam"
    underage = "underage"
    hate = "hate"
    other = "other"


class ReportStatus(enum.StrEnum):
    open = "open"
    in_review = "in_review"
    actioned = "actioned"
    dismissed = "dismissed"


class Report(CreatedAtMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("char_length(details) <= 1000", name="details_length"),
        CheckConstraint("priority BETWEEN 1 AND 3", name="priority_range"),
        CheckConstraint("(resolved_at IS NULL) = (status IN ('open', 'in_review'))", name="resolved_consistent"),
        Index("ix_reports_queue", "status", "priority", "created_at"),
        Index("ix_reports_resolved_at", "resolved_at", postgresql_where=text("resolved_at IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reason: Mapped[ReportReason] = mapped_column(_enum(ReportReason, "reason"))
    details: Mapped[str | None] = mapped_column(String(1000))
    message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"), index=True)
    # A copy of the reported message: the only message text staff ever see.
    evidence_text: Mapped[str | None] = mapped_column(String(2000))
    photo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("photos.id", ondelete="SET NULL"), index=True)
    status: Mapped[ReportStatus] = mapped_column(_enum(ReportStatus, "status"), server_default=ReportStatus.open.value)
    # 1 first: underage; 2: harm (explicit, harassment, hate, scam); 3: the rest.
    priority: Mapped[int] = mapped_column(SmallInteger)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    resolved_at: Mapped[datetime | None]
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)


class ActionKind(enum.StrEnum):
    dismiss = "dismiss"
    warn = "warn"
    remove_photo = "remove_photo"
    remove_message = "remove_message"
    suspend = "suspend"
    ban = "ban"
    reinstate = "reinstate"
    approve_photo = "approve_photo"
    reject_photo = "reject_photo"


class ModerationAction(CreatedAtMixin, Base):
    """Append-only (the runtime role may only INSERT and SELECT). No foreign
    keys: the record must outlive the accounts it names."""

    __tablename__ = "moderation_actions"
    __table_args__ = (
        CheckConstraint("char_length(note) <= 500", name="note_length"),
        Index("ix_moderation_actions_target", "target_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    moderator_id: Mapped[uuid.UUID] = mapped_column(index=True)
    target_user_id: Mapped[uuid.UUID | None]
    report_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    photo_id: Mapped[uuid.UUID | None]
    message_id: Mapped[uuid.UUID | None]
    action: Mapped[ActionKind] = mapped_column(_enum(ActionKind, "action"))
    # The moderator's reason, for other staff. Guidance: no personal data.
    note: Mapped[str | None] = mapped_column(String(500))
