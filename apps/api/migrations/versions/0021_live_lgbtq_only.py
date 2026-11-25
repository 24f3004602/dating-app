"""Live: a member's choice to be paired only with LGBTQ+ members (stage 29a, D161).

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "call_members",
        sa.Column("lgbtq_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("call_members", "lgbtq_only")
