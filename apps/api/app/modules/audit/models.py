from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import CheckConstraint, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class AuditLog(CreatedAtMixin, Base):
    """Append-only record of security-relevant actions.

    No foreign keys on purpose: the trail must outlive the accounts it
    mentions (see privacy-data-inventory.md for retention). The runtime role
    may only INSERT and SELECT (see the baseline migration). `metadata` must
    never hold personal data.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint("action ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'", name="action_format"),
        CheckConstraint("jsonb_typeof(metadata) = 'object'", name="metadata_is_object"),
        Index("ix_audit_log_target", "target_type", "target_id", "created_at"),
        Index("ix_audit_log_actor", "actor_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    # NULL actor means the system (a job or a migration).
    actor_id: Mapped[uuid.UUID | None]
    action: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[uuid.UUID | None]
    request_id: Mapped[str | None] = mapped_column(String(64))
    # `metadata` is reserved on declarative classes, hence the attribute name.
    details: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default=text("'{}'::jsonb"))
