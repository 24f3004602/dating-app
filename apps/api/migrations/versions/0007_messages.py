"""Messages, read pointers and conversation state on matches (stage 10, D072).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("last_message_n", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.add_column("matches", sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("matches", sa.Column("last_sender_id", sa.Uuid(), nullable=True))
    op.create_check_constraint(op.f("ck_matches_last_message_n"), "matches", "last_message_n >= 0")
    op.create_check_constraint(
        op.f("ck_matches_last_message_consistent"),
        "matches",
        "(last_message_n = 0) = (last_message_at IS NULL) AND (last_message_at IS NULL) = (last_sender_id IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_matches_last_sender"), "matches", "last_sender_id IS NULL OR last_sender_id IN (user_a_id, user_b_id)"
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("client_message_id", sa.Uuid(), nullable=False),
        sa.Column("flag", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_messages"),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], name="fk_messages_match_id_matches", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], name="fk_messages_sender_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("match_id", "n", name="uq_messages_match_id_n"),
        sa.UniqueConstraint(
            "match_id", "sender_id", "client_message_id", name="uq_messages_match_id_sender_id_client_message_id"
        ),
        sa.CheckConstraint("n >= 1", name=op.f("ck_messages_n_positive")),
        sa.CheckConstraint("char_length(body) BETWEEN 1 AND 2000", name=op.f("ck_messages_body_length")),
        sa.CheckConstraint("flag IN ('hurtful', 'money')", name=op.f("ck_messages_flag")),
    )
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])

    op.create_table(
        "match_reads",
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_read_n", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("match_id", "user_id", name="pk_match_reads"),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name="fk_match_reads_match_id_matches", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_match_reads_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("last_read_n >= 0", name=op.f("ck_match_reads_last_read_n")),
    )
    op.create_index("ix_match_reads_user_id", "match_reads", ["user_id"])

    role = runtime_role()
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO "{role}"')
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON match_reads TO "{role}"')


def downgrade() -> None:
    op.drop_table("match_reads")
    op.drop_table("messages")
    op.drop_constraint(op.f("ck_matches_last_sender"), "matches", type_="check")
    op.drop_constraint(op.f("ck_matches_last_message_consistent"), "matches", type_="check")
    op.drop_constraint(op.f("ck_matches_last_message_n"), "matches", type_="check")
    op.drop_column("matches", "last_sender_id")
    op.drop_column("matches", "last_message_at")
    op.drop_column("matches", "last_message_n")
