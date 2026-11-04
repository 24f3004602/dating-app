from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class ModerationState(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Photo(CreatedAtMixin, Base):
    __tablename__ = "photos"
    __table_args__ = (
        # Deferrable so a reorder can swap positions inside one transaction.
        UniqueConstraint("user_id", "position", deferrable=True, initially="IMMEDIATE"),
        CheckConstraint("position BETWEEN 0 AND 5", name="position_range"),
        CheckConstraint("octet_length(sha256) = 32", name="sha256_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(SmallInteger)
    # Random base for the object keys; carries no user information.
    storage_key: Mapped[str] = mapped_column(String(64), unique=True)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[bytes] = mapped_column(LargeBinary, index=True)
    moderation_state: Mapped[ModerationState] = mapped_column(
        Enum(
            ModerationState,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="moderation_state",
            values_callable=lambda e: [m.value for m in e],
        ),
        server_default=ModerationState.pending.value,
    )
    reviewed_at: Mapped[datetime | None]
