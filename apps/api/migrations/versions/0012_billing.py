"""Subscriptions and processed payment events (stage 16b, D094). Sandbox only.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUSES = "'created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired'"


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("provider_subscription_id", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'created'"), nullable=False),
        sa.Column("current_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_cycle_end", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_subscriptions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_subscriptions_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("provider_subscription_id", name="uq_subscriptions_provider_subscription_id"),
        sa.CheckConstraint(f"status IN ({STATUSES})", name=op.f("ck_subscriptions_status_known")),
    )
    op.create_index("ix_subscriptions_user_id_created_at", "subscriptions", ["user_id", "created_at"])

    op.create_table(
        "payment_events",
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("event", sa.String(48), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("provider", "event_id", name="pk_payment_events"),
    )
    op.create_index("ix_payment_events_received_at", "payment_events", ["received_at"])

    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions, payment_events TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("payment_events")
    op.drop_table("subscriptions")
