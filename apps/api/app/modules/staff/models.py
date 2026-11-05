"""Staff two-factor sign-in (stage 14, D090).

- `staff_mfa`: the TOTP secret, encrypted (AES-256-GCM, key derived from
  APP_SECRET_KEY, the user ID as associated data), and the last time step
  accepted, so a code is never accepted twice.
- `staff_recovery_codes`: ten single-use codes per enrolment, HMAC'd.
- `staff_enrollments`: one-time tokens that allow a first (or new) TOTP
  enrolment, issued by an admin or the CLI; SHA-256 only. A password alone
  never sets up a second factor.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, LargeBinary, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class StaffMfa(Base):
    __tablename__ = "staff_mfa"
    __table_args__ = (CheckConstraint("octet_length(secret_enc) BETWEEN 40 AND 128", name="secret_enc_length"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    secret_enc: Mapped[bytes] = mapped_column(LargeBinary)
    enrolled_at: Mapped[datetime]
    # The highest TOTP time step accepted (30-second steps since the epoch).
    last_step: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))


class StaffRecoveryCode(CreatedAtMixin, Base):
    __tablename__ = "staff_recovery_codes"
    __table_args__ = (CheckConstraint("octet_length(code_hash) = 32", name="code_hash_length"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    used_at: Mapped[datetime | None]


class StaffEnrollment(CreatedAtMixin, Base):
    __tablename__ = "staff_enrollments"
    __table_args__ = (
        CheckConstraint("octet_length(token_hash) = 32", name="token_hash_length"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    # The admin who issued it; NULL for the CLI (server access).
    issued_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime] = mapped_column(index=True)
    used_at: Mapped[datetime | None]
