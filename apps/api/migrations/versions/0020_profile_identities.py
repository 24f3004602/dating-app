"""Optional LGBTQ+ labels on profiles (stage 29a, D160): up to three, shown on the profile, stored
only when a member chooses to add them.

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("identities", ARRAY(sa.String(16)), nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_check_constraint(
        op.f("ck_profiles_identities_valid"),
        "profiles",
        "cardinality(identities) <= 3 AND identities <@ ARRAY['trans','gay','lesbian','bisexual','queer',"
        "'pansexual','asexual','intersex','questioning']::varchar[]",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_profiles_identities_valid"), "profiles", type_="check")
    op.drop_column("profiles", "identities")
