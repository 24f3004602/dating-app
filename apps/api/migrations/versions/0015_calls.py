"""Live: random one-to-one video calls (stage 23, D123): Live members, the
queue, call records, and reports made from a call.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "call_members",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rules_version", sa.String(16), nullable=False),
        sa.Column("rules_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("free_calls_used", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_call_members"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_call_members_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("free_calls_used >= 0", name=op.f("ck_call_members_free_calls_used")),
    )

    op.create_table(
        "call_queue",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_call_queue"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_call_queue_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_call_queue_joined_at", "call_queue", ["joined_at"])

    op.create_table(
        "calls",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_a_id", sa.Uuid(), nullable=False),
        sa.Column("user_b_id", sa.Uuid(), nullable=False),
        sa.Column("client_a", sa.String(36), nullable=False),
        sa.Column("client_b", sa.String(36), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("limit_s", sa.SmallInteger(), nullable=False),
        sa.Column("free_a", sa.Boolean(), nullable=False),
        sa.Column("free_b", sa.Boolean(), nullable=False),
        sa.Column("offer_sdp", sa.Text(), nullable=True),
        sa.Column("answer_sdp", sa.Text(), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_calls"),
        sa.ForeignKeyConstraint(["user_a_id"], ["users.id"], name="fk_calls_user_a_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_b_id"], ["users.id"], name="fk_calls_user_b_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("user_a_id <> user_b_id", name=op.f("ck_calls_two_people")),
        sa.CheckConstraint("limit_s > 0", name=op.f("ck_calls_limit_positive")),
        sa.CheckConstraint("(state = 'ended') = (ended_at IS NOT NULL)", name=op.f("ck_calls_ended_consistent")),
        sa.CheckConstraint("(ended_at IS NULL) = (end_reason IS NULL)", name=op.f("ck_calls_end_reason_consistent")),
        sa.CheckConstraint("(connected_at IS NULL) = (ends_at IS NULL)", name=op.f("ck_calls_ends_at_consistent")),
        sa.CheckConstraint("state IN ('connecting', 'live', 'ended')", name=op.f("ck_calls_state")),
        sa.CheckConstraint(
            "end_reason IN ('hangup', 'next', 'limit', 'timeout', 'failed', 'report', 'left')",
            name=op.f("ck_calls_end_reason"),
        ),
    )
    op.create_index("ix_calls_user_a_id_created_at", "calls", ["user_a_id", "created_at"])
    op.create_index("ix_calls_user_b_id_created_at", "calls", ["user_b_id", "created_at"])

    op.add_column("reports", sa.Column("call_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_reports_call_id_calls", "reports", "calls", ["call_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_reports_call_id", "reports", ["call_id"])

    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON call_members, call_queue, calls TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_index("ix_reports_call_id", table_name="reports")
    op.drop_constraint("fk_reports_call_id_calls", "reports", type_="foreignkey")
    op.drop_column("reports", "call_id")
    op.drop_table("calls")
    op.drop_table("call_queue")
    op.drop_table("call_members")
