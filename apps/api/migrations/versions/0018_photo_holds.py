"""A reported photo held until staff decide (stage 28e, D157): India's IT Rules give two hours
to remove or block an image showing someone nude or in a sexual act, or impersonating them.

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("held_at", sa.DateTime(timezone=True), nullable=True))
    # A held photo is always pending: hidden from everyone but its owner.
    op.create_check_constraint(
        op.f("ck_photos_held_pending"), "photos", "held_at IS NULL OR moderation_state = 'pending'"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_photos_held_pending"), "photos", type_="check")
    op.drop_column("photos", "held_at")
