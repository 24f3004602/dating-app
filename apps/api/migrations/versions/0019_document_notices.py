"""Notices of new documents and the reminder of the rules (stage 28f, D159): the terms and privacy
notice say members are told in the app when they change, and India's IT Rules (rule 3(1)(c)) ask
for a reminder of the rules at least every three months.

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_member_notices_kind"), "member_notices", type_="check")
    op.create_check_constraint(
        op.f("ck_member_notices_kind"), "member_notices", "kind IN ('warning', 'new_documents', 'rules_reminder')"
    )
    op.add_column("member_notices", sa.Column("version", sa.String(32), nullable=True))
    op.create_check_constraint(
        op.f("ck_member_notices_version_documents"),
        "member_notices",
        "(kind = 'new_documents') = (version IS NOT NULL)",
    )


def downgrade() -> None:
    op.execute("DELETE FROM member_notices WHERE kind IN ('new_documents', 'rules_reminder')")
    op.drop_constraint(op.f("ck_member_notices_version_documents"), "member_notices", type_="check")
    op.drop_column("member_notices", "version")
    op.drop_constraint(op.f("ck_member_notices_kind"), "member_notices", type_="check")
    op.create_check_constraint(op.f("ck_member_notices_kind"), "member_notices", "kind IN ('warning')")
