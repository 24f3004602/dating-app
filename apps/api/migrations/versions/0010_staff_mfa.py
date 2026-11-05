"""Staff two-factor sign-in: authenticator secrets, recovery codes, enrolment tokens (stage 14, D090).

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "staff_mfa",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("secret_enc", sa.LargeBinary(), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_step", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_staff_mfa"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_staff_mfa_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("octet_length(secret_enc) BETWEEN 40 AND 128", name=op.f("ck_staff_mfa_secret_enc_length")),
    )
    op.create_table(
        "staff_recovery_codes",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.LargeBinary(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_staff_recovery_codes"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_staff_recovery_codes_user_id_users", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("code_hash", name="uq_staff_recovery_codes_code_hash"),
        sa.CheckConstraint("octet_length(code_hash) = 32", name=op.f("ck_staff_recovery_codes_code_hash_length")),
    )
    op.create_index("ix_staff_recovery_codes_user_id", "staff_recovery_codes", ["user_id"])
    op.create_table(
        "staff_enrollments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("issued_by", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_staff_enrollments"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_staff_enrollments_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["issued_by"], ["users.id"], name="fk_staff_enrollments_issued_by_users", ondelete="SET NULL"
        ),
        sa.UniqueConstraint("token_hash", name="uq_staff_enrollments_token_hash"),
        sa.CheckConstraint("octet_length(token_hash) = 32", name=op.f("ck_staff_enrollments_token_hash_length")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_staff_enrollments_expires_after_created")),
    )
    op.create_index("ix_staff_enrollments_user_id", "staff_enrollments", ["user_id"])
    op.create_index("ix_staff_enrollments_expires_at", "staff_enrollments", ["expires_at"])
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON staff_mfa, staff_recovery_codes, staff_enrollments "
        f'TO "{runtime_role()}"'
    )


def downgrade() -> None:
    op.drop_table("staff_enrollments")
    op.drop_table("staff_recovery_codes")
    op.drop_table("staff_mfa")
