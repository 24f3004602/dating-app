"""Sign in with Google (D134): another provider's sign-in linked to an account.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_identities",
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("provider", "subject", name="pk_user_identities"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_identities_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("provider", "user_id", name="uq_user_identities_provider_user_id"),
    )
    op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON user_identities TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("user_identities")
