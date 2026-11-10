"""The waitlist (stage 20c, D101): double opt-in entries for the opening email.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email_normalized", sa.String(length=254), nullable=False),
        sa.Column("privacy_version", sa.String(length=32), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirm_token_hash", sa.LargeBinary(), nullable=True),
        sa.Column("confirm_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_waitlist_entries")),
        sa.UniqueConstraint("email_normalized", name=op.f("uq_waitlist_entries_email_normalized")),
        sa.CheckConstraint(
            "email_normalized = lower(email_normalized)", name=op.f("ck_waitlist_entries_email_lowercase")
        ),
        sa.CheckConstraint(
            "char_length(email_normalized) BETWEEN 3 AND 254", name=op.f("ck_waitlist_entries_email_length")
        ),
        sa.CheckConstraint(
            "confirm_token_hash IS NULL OR octet_length(confirm_token_hash) = 32",
            name=op.f("ck_waitlist_entries_token_hash_length"),
        ),
        sa.CheckConstraint(
            "(confirm_token_hash IS NULL) = (confirm_expires_at IS NULL)",
            name=op.f("ck_waitlist_entries_token_with_expiry"),
        ),
        sa.CheckConstraint(
            "notified_at IS NULL OR confirmed_at IS NOT NULL",
            name=op.f("ck_waitlist_entries_notified_only_if_confirmed"),
        ),
    )
    op.create_index("ix_waitlist_entries_confirm_token_hash", "waitlist_entries", ["confirm_token_hash"], unique=True)
    op.create_index("ix_waitlist_entries_created_at", "waitlist_entries", ["created_at"])
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_entries TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("waitlist_entries")
