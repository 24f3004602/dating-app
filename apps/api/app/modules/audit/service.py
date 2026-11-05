"""Writing to the append-only audit trail."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.logs import request_id_var
from app.modules.audit.models import AuditLog


def record(
    session: AsyncSession,
    event: str,
    *,
    actor: uuid.UUID | None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    **details: str | int | bool,
) -> None:
    """Add an audit entry to the current transaction. `details` hold codes and
    counts only, never personal data (privacy inventory)."""
    session.add(
        AuditLog(
            actor_id=actor,
            action=event,
            target_type=target_type,
            target_id=target_id,
            request_id=request_id_var.get(),
            details=dict(details),
        )
    )
