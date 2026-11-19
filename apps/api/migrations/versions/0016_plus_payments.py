"""The Plus pass, paid by UPI (D127): one row per payment attempt, its UPI
reference, an admin's decision, and the pass it brings.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plus_payments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("code", sa.String(8), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("days", sa.SmallInteger(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("utr", sa.String(12), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("reject_reason", sa.String(16), nullable=True),
        sa.Column("plus_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("plus_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_plus_payments"),
        sa.UniqueConstraint("code", name="uq_plus_payments_code"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_plus_payments_user_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name="fk_plus_payments_decided_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_plus_payments_amount_positive")),
        sa.CheckConstraint("days > 0", name=op.f("ck_plus_payments_days_positive")),
        sa.CheckConstraint("utr IS NULL OR utr ~ '^[0-9]{12}$'", name=op.f("ck_plus_payments_utr_digits")),
        sa.CheckConstraint(
            "(status IN ('open', 'expired')) = (utr IS NULL)", name=op.f("ck_plus_payments_utr_once_sent")
        ),
        sa.CheckConstraint(
            "(status IN ('approved', 'rejected')) = (decided_at IS NOT NULL)",
            name=op.f("ck_plus_payments_decided_consistent"),
        ),
        sa.CheckConstraint(
            "(status = 'approved') = (plus_until IS NOT NULL)", name=op.f("ck_plus_payments_approved_has_period")
        ),
        sa.CheckConstraint(
            "(status = 'rejected') = (reject_reason IS NOT NULL)", name=op.f("ck_plus_payments_rejected_has_reason")
        ),
        sa.CheckConstraint(
            "plus_until IS NULL OR plus_until > plus_from", name=op.f("ck_plus_payments_period_forward")
        ),
        sa.CheckConstraint(
            "status IN ('open', 'submitted', 'approved', 'rejected', 'expired')", name=op.f("ck_plus_payments_status")
        ),
        sa.CheckConstraint(
            "reject_reason IN ('not_found', 'wrong_amount', 'other')", name=op.f("ck_plus_payments_reject_reason")
        ),
    )
    op.create_index("ix_plus_payments_user_id_created_at", "plus_payments", ["user_id", "created_at"])
    op.create_index("ix_plus_payments_status_submitted_at", "plus_payments", ["status", "submitted_at"])
    op.create_index(
        "uq_plus_payments_utr",
        "plus_payments",
        ["utr"],
        unique=True,
        postgresql_where=sa.text("status IN ('submitted', 'approved')"),
    )
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON plus_payments TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("plus_payments")
