"""Preferences, daily picks, interactions and blocks (stage 8, D064).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _created() -> sa.Column[Any]:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("age_min", sa.SmallInteger(), nullable=False),
        sa.Column("age_max", sa.SmallInteger(), nullable=False),
        sa.Column("max_distance_km", sa.SmallInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_preferences"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_preferences_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(
            "age_min BETWEEN 18 AND 99 AND age_max BETWEEN 18 AND 99", name=op.f("ck_preferences_age_range")
        ),
        sa.CheckConstraint("age_min <= age_max", name=op.f("ck_preferences_age_order")),
        sa.CheckConstraint(
            "max_distance_km IS NULL OR max_distance_km IN (5, 15, 50)", name=op.f("ck_preferences_distance_bucket")
        ),
    )

    op.create_table(
        "daily_picks",
        sa.Column("viewer_id", sa.Uuid(), nullable=False),
        sa.Column("pick_date", sa.Date(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=False),
        sa.Column("distance_bucket", sa.String(16), nullable=False),
        _created(),
        sa.PrimaryKeyConstraint("viewer_id", "pick_date", "candidate_id", name="pk_daily_picks"),
        sa.ForeignKeyConstraint(["viewer_id"], ["users.id"], name="fk_daily_picks_viewer_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["candidate_id"], ["users.id"], name="fk_daily_picks_candidate_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_daily_picks_candidate_id", "daily_picks", ["candidate_id"])

    op.create_table(
        "interactions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("comment", sa.String(150), nullable=True),
        _created(),
        sa.PrimaryKeyConstraint("id", name="pk_interactions"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], name="fk_interactions_actor_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["target_id"], ["users.id"], name="fk_interactions_target_id_users", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("actor_id", "target_id", name="uq_interactions_actor_id_target_id"),
        sa.CheckConstraint("actor_id <> target_id", name=op.f("ck_interactions_not_self")),
        sa.CheckConstraint("char_length(comment) <= 150", name=op.f("ck_interactions_comment_length")),
        sa.CheckConstraint("kind IN ('like', 'pass')", name=op.f("ck_interactions_kind")),
    )
    op.create_index("ix_interactions_target_kind", "interactions", ["target_id", "kind"])

    op.create_table(
        "blocks",
        sa.Column("blocker_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_id", sa.Uuid(), nullable=False),
        _created(),
        sa.PrimaryKeyConstraint("blocker_id", "blocked_id", name="pk_blocks"),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], name="fk_blocks_blocker_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], name="fk_blocks_blocked_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("blocker_id <> blocked_id", name=op.f("ck_blocks_not_self")),
    )
    op.create_index("ix_blocks_blocked_id", "blocks", ["blocked_id"])

    op.execute(
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON preferences, daily_picks, interactions, blocks TO "{runtime_role()}"'
    )


def downgrade() -> None:
    op.drop_table("blocks")
    op.drop_table("interactions")
    op.drop_table("daily_picks")
    op.drop_table("preferences")
