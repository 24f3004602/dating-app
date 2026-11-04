from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Enum, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class UserStatus(enum.StrEnum):
    pending = "pending"
    active = "active"
    suspended = "suspended"
    banned = "banned"
    deactivated = "deactivated"


class UserRole(enum.StrEnum):
    member = "member"
    moderator = "moderator"
    admin = "admin"


# Marks an account that cannot log in. Used for development fixtures until
# stage 6 adds real password hashing.
UNUSABLE_PASSWORD = "!"  # noqa: S105 - a sentinel that matches no hash, not a password


class User(CreatedAtMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email_normalized = lower(email_normalized)", name="email_lowercase"),
        CheckConstraint("char_length(email_normalized) BETWEEN 3 AND 254", name="email_length"),
        CheckConstraint("birthdate >= DATE '1900-01-01'", name="birthdate_plausible"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    email_normalized: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    birthdate: Mapped[date]
    status: Mapped[UserStatus] = mapped_column(
        Enum(
            UserStatus,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="status",
            values_callable=lambda e: [m.value for m in e],
        ),
        server_default=UserStatus.pending.value,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="role",
            values_callable=lambda e: [m.value for m in e],
        ),
        server_default=UserRole.member.value,
    )
    email_verified_at: Mapped[datetime | None]
    last_active_at: Mapped[datetime | None]
    deletion_requested_at: Mapped[datetime | None] = mapped_column(index=True)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
