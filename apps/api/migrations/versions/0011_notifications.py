"""Push devices (one per session), notification preferences, notices from the team, push tickets (stage 16, D093).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("session_id", name="pk_push_devices"),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_push_devices_session_id_sessions", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_push_devices_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("token", name="uq_push_devices_token"),
        sa.CheckConstraint("char_length(token) BETWEEN 20 AND 255", name=op.f("ck_push_devices_token_length")),
        sa.CheckConstraint("platform IN ('ios', 'android')", name=op.f("ck_push_devices_platform")),
    )
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"])

    op.create_table(
        "notification_prefs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("matches", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("messages", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("likes", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_notification_prefs"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_notification_prefs_user_id_users", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "member_notices",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_member_notices"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_member_notices_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("kind IN ('warning')", name=op.f("ck_member_notices_kind")),
    )
    op.create_index("ix_member_notices_user_id", "member_notices", ["user_id"])

    op.create_table(
        "push_tickets",
        sa.Column("receipt_id", sa.String(64), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("receipt_id", name="pk_push_tickets"),
    )
    op.create_index("ix_push_tickets_token", "push_tickets", ["token"])
    op.create_index("ix_push_tickets_created_at", "push_tickets", ["created_at"])

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON push_devices, notification_prefs, member_notices, push_tickets "
        f'TO "{runtime_role()}"'
    )


def downgrade() -> None:
    op.drop_table("push_tickets")
    op.drop_table("member_notices")
    op.drop_table("notification_prefs")
    op.drop_table("push_devices")
