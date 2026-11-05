"""What is left of a deleted account (D083): a dated record for one year.

- `consents`: the document versions the member accepted and when, as proof
  of notice (DPDP), with nothing else about them.
- `email_digest`: only for banned accounts, a keyed hash of the email, so the
  same address cannot sign up again straight away. Nobody can read the email
  back from it; rotating `APP_SECRET_KEY` makes old digests useless.

No foreign key: the user row is gone. The audit trail refers to the same ID.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, Index, LargeBinary, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DeletedAccount(Base):
    __tablename__ = "deleted_accounts"
    __table_args__ = (
        CheckConstraint("email_digest IS NULL OR octet_length(email_digest) = 32", name="email_digest_length"),
        CheckConstraint("jsonb_typeof(consents) = 'array'", name="consents_is_array"),
        CheckConstraint("keep_until > deleted_at", name="keep_after_deleted"),
        Index("ix_deleted_accounts_email_digest", "email_digest", postgresql_where=text("email_digest IS NOT NULL")),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    # NULL when the purge followed a ban rather than the member's request.
    requested_at: Mapped[datetime | None]
    deleted_at: Mapped[datetime]
    was_banned: Mapped[bool]
    email_digest: Mapped[bytes | None] = mapped_column(LargeBinary)
    consents: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    keep_until: Mapped[datetime] = mapped_column(index=True)
