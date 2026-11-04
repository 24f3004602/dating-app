"""Matches; what a like was about (stage 9, D024).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("interactions", sa.Column("target_photo_id", sa.Uuid(), nullable=True))
    op.add_column("interactions", sa.Column("target_prompt_key", sa.String(32), nullable=True))
    op.create_foreign_key(
        "fk_interactions_target_photo_id_photos",
        "interactions",
        "photos",
        ["target_photo_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "matches",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_a_id", sa.Uuid(), nullable=False),
        sa.Column("user_b_id", sa.Uuid(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_reason", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_matches"),
        sa.ForeignKeyConstraint(["user_a_id"], ["users.id"], name="fk_matches_user_a_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_b_id"], ["users.id"], name="fk_matches_user_b_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("user_a_id", "user_b_id", name="uq_matches_user_a_id_user_b_id"),
        sa.CheckConstraint("user_a_id < user_b_id", name=op.f("ck_matches_ordered_pair")),
        sa.CheckConstraint("(closed_at IS NULL) = (closed_reason IS NULL)", name=op.f("ck_matches_closed_consistent")),
        sa.CheckConstraint(
            "closed_reason IN ('unmatched', 'blocked', 'deleted', 'moderation')", name=op.f("ck_matches_closed_reason")
        ),
    )
    op.create_index("ix_matches_user_b_id", "matches", ["user_b_id"])
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON matches TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("matches")
    op.drop_constraint("fk_interactions_target_photo_id_photos", "interactions", type_="foreignkey")
    op.drop_column("interactions", "target_prompt_key")
    op.drop_column("interactions", "target_photo_id")
