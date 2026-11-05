from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, SmallInteger, String, UniqueConstraint, func, text
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
        # The retention sweep: sign-ups never confirmed are deleted after 7 days.
        Index("ix_users_pending_created_at", "created_at", postgresql_where=text("status = 'pending'")),
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
    # Consecutive failed password logins; reset on success or password reset.
    # At the lockout threshold password sign-in stops until a reset (NIST
    # SP 800-63B-4: at most 100 consecutive failures).
    failed_login_count: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class ConsentKind(enum.StrEnum):
    terms = "terms"
    privacy = "privacy"


class Consent(Base):
    """Proof of notice and consent (DPDP): which document version, and when."""

    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("user_id", "kind", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[ConsentKind] = mapped_column(
        Enum(
            ConsentKind,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="kind",
            values_callable=lambda e: [m.value for m in e],
        ),
    )
    version: Mapped[str] = mapped_column(String(32))
    granted_at: Mapped[datetime] = mapped_column(server_default=func.now())
    withdrawn_at: Mapped[datetime | None]
