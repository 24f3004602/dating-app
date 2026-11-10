"""Waitlist entries (stage 20c, D101).

The address is kept in plain text because it is used once, for the opening
email. The confirmation token is kept only as a SHA-256 digest; the leave
link is an HMAC of the entry's ID, so it needs no storage at all.
Retention (privacy inventory): unconfirmed entries go when their link
expires, confirmed ones 30 days after the opening email, and every entry
after a year at most (`privacy/retention.py`).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, LargeBinary, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


class WaitlistEntry(CreatedAtMixin, Base):
    __tablename__ = "waitlist_entries"
    __table_args__ = (
        CheckConstraint("email_normalized = lower(email_normalized)", name="email_lowercase"),
        CheckConstraint("char_length(email_normalized) BETWEEN 3 AND 254", name="email_length"),
        CheckConstraint(
            "confirm_token_hash IS NULL OR octet_length(confirm_token_hash) = 32", name="token_hash_length"
        ),
        CheckConstraint("(confirm_token_hash IS NULL) = (confirm_expires_at IS NULL)", name="token_with_expiry"),
        CheckConstraint("notified_at IS NULL OR confirmed_at IS NOT NULL", name="notified_only_if_confirmed"),
        Index("ix_waitlist_entries_confirm_token_hash", "confirm_token_hash", unique=True),
        Index("ix_waitlist_entries_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    email_normalized: Mapped[str] = mapped_column(String(254), unique=True)
    # The privacy notice version shown with the form: proof of what was agreed to.
    privacy_version: Mapped[str] = mapped_column(String(32))
    confirmed_at: Mapped[datetime | None]
    confirm_token_hash: Mapped[bytes | None] = mapped_column(LargeBinary)
    confirm_expires_at: Mapped[datetime | None]
    # When the one opening email went out (not sent by anything yet).
    notified_at: Mapped[datetime | None]
