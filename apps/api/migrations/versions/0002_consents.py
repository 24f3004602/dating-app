"""Consents and the consecutive failed-login counter (stage 6).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("failed_login_count", sa.SmallInteger(), server_default=sa.text("0"), nullable=False)
    )
    op.create_check_constraint(op.f("ck_users_failed_login_count_non_negative"), "users", "failed_login_count >= 0")

    op.create_table(
        "consents",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_consents"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_consents_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "kind", "version", name="uq_consents_user_id_kind_version"),
        sa.CheckConstraint("kind IN ('terms', 'privacy')", name=op.f("ck_consents_kind")),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON consents TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("consents")
    op.drop_constraint(op.f("ck_users_failed_login_count_non_negative"), "users", type_="check")
    op.drop_column("users", "failed_login_count")
