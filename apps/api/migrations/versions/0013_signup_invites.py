"""Invite-only sign-up for the closed beta (stage 18, D096): HMACs of invited emails.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "signup_invites",
        sa.Column("email_digest", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("email_digest", name="pk_signup_invites"),
        sa.CheckConstraint("octet_length(email_digest) = 32", name=op.f("ck_signup_invites_email_digest_length")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_signup_invites_expires_after_created")),
    )
    op.create_index("ix_signup_invites_expires_at", "signup_invites", ["expires_at"])
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON signup_invites TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("signup_invites")
