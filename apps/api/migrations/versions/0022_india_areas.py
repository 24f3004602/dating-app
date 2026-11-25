"""Areas across India (stage 29a, D162): towns from GeoNames beside Delhi NCR's own areas, a
featured list for before anyone searches, search names, and "within 150 km".

The towns come from `migrations/data/india_areas.csv`, built by `scripts/build_india_areas.py`
from GeoNames (https://www.geonames.org, CC BY 4.0): Indian places with more than 15,000 people,
coordinates rounded to 0.01 degree.

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-25
"""

import csv
import pathlib
from collections.abc import Sequence
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DATA = pathlib.Path(__file__).resolve().parents[1] / "data" / "india_areas.csv"


def _towns() -> list[dict[str, object]]:
    with DATA.open(encoding="utf-8", newline="") as f:
        return [
            {
                "id": r["id"],
                "city": r["city"],
                "name": r["name"],
                "latitude": Decimal(r["latitude"]),
                "longitude": Decimal(r["longitude"]),
                "population": int(r["population"]),
                "featured": r["featured"] == "1",
                "aliases": r["aliases"],
            }
            for r in csv.DictReader(f)
        ]


def upgrade() -> None:
    op.add_column("areas", sa.Column("population", sa.Integer(), nullable=True))
    op.add_column("areas", sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("areas", sa.Column("aliases", sa.String(120), nullable=False, server_default=sa.text("''")))
    op.execute("UPDATE areas SET featured = true")  # Delhi NCR's own areas, all of them
    op.execute("UPDATE areas SET aliases = 'gurgaon' WHERE city = 'Gurugram'")
    areas = sa.table(
        "areas",
        sa.column("id", sa.String),
        sa.column("city", sa.String),
        sa.column("name", sa.String),
        sa.column("latitude", sa.Numeric),
        sa.column("longitude", sa.Numeric),
        sa.column("population", sa.Integer),
        sa.column("featured", sa.Boolean),
        sa.column("aliases", sa.String),
    )
    op.bulk_insert(areas, _towns())

    op.drop_constraint(op.f("ck_preferences_distance_bucket"), "preferences", type_="check")
    op.create_check_constraint(
        op.f("ck_preferences_distance_bucket"),
        "preferences",
        "max_distance_km IS NULL OR max_distance_km IN (5, 15, 50, 150)",
    )


def downgrade() -> None:
    op.execute("UPDATE preferences SET max_distance_km = NULL WHERE max_distance_km = 150")
    op.drop_constraint(op.f("ck_preferences_distance_bucket"), "preferences", type_="check")
    op.create_check_constraint(
        op.f("ck_preferences_distance_bucket"),
        "preferences",
        "max_distance_km IS NULL OR max_distance_km IN (5, 15, 50)",
    )
    op.execute("DELETE FROM areas WHERE id LIKE 'gn.%'")  # refused while a profile still uses one
    op.drop_column("areas", "aliases")
    op.drop_column("areas", "featured")
    op.drop_column("areas", "population")
