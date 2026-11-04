from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, LargeBinary, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class SessionClient(enum.StrEnum):
    mobile = "mobile"
    web_admin = "web_admin"


class CodePurpose(enum.StrEnum):
    verify_email = "verify_email"
    reset_password = "reset_password"  # noqa: S105 - an enum value, not a password


class Session(CreatedAtMixin, Base):
    """An opaque session. Only the SHA-256 of the token is stored (D023)."""

    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("octet_length(token_hash) = 32", name="token_hash_sha256"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    client: Mapped[SessionClient] = mapped_column(
        Enum(
            SessionClient,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="client",
            values_callable=lambda e: [m.value for m in e],
        ),
    )
    # A shortened user agent (for a future device list); never the raw header.
    user_agent: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(index=True)
    revoked_at: Mapped[datetime | None]
    last_used_at: Mapped[datetime | None]


class OneTimeCode(CreatedAtMixin, Base):
    """A short-lived single-use code. Only a keyed HMAC is stored."""

    __tablename__ = "one_time_codes"
    __table_args__ = (
        CheckConstraint("octet_length(code_hash) = 32", name="code_hash_hmac_sha256"),
        CheckConstraint("attempts >= 0", name="attempts_non_negative"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        # One live (unconsumed) code per user and purpose.
        Index(
            "uq_one_time_codes_live",
            "user_id",
            "purpose",
            unique=True,
            postgresql_where=text("consumed_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[CodePurpose] = mapped_column(
        Enum(
            CodePurpose,
            native_enum=False,
            create_constraint=True,
            length=32,
            name="purpose",
            values_callable=lambda e: [m.value for m in e],
        ),
    )
    code_hash: Mapped[bytes] = mapped_column(LargeBinary)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    consumed_at: Mapped[datetime | None]
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
