"""Areas (seeded), profiles, prompts and photos (stage 7).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-04

Area centroids are approximate public coordinates, rounded to 0.01 degree
(about 1 km), entered by hand for the Delhi NCR beta: enough for distance
buckets (D020). To be checked against an authoritative source before launch.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (id, city, name, latitude, longitude)
AREAS = [
    ("delhi.connaught-place", "Delhi", "Connaught Place", 28.63, 77.22),
    ("delhi.karol-bagh", "Delhi", "Karol Bagh", 28.65, 77.19),
    ("delhi.chandni-chowk", "Delhi", "Chandni Chowk", 28.65, 77.23),
    ("delhi.civil-lines", "Delhi", "Civil Lines", 28.68, 77.22),
    ("delhi.rohini", "Delhi", "Rohini", 28.73, 77.11),
    ("delhi.pitampura", "Delhi", "Pitampura", 28.70, 77.13),
    ("delhi.rajouri-garden", "Delhi", "Rajouri Garden", 28.65, 77.12),
    ("delhi.janakpuri", "Delhi", "Janakpuri", 28.62, 77.08),
    ("delhi.dwarka", "Delhi", "Dwarka", 28.59, 77.05),
    ("delhi.vasant-kunj", "Delhi", "Vasant Kunj", 28.52, 77.16),
    ("delhi.hauz-khas", "Delhi", "Hauz Khas", 28.55, 77.20),
    ("delhi.saket", "Delhi", "Saket", 28.52, 77.21),
    ("delhi.greater-kailash", "Delhi", "Greater Kailash", 28.54, 77.24),
    ("delhi.lajpat-nagar", "Delhi", "Lajpat Nagar", 28.57, 77.24),
    ("delhi.okhla", "Delhi", "Okhla", 28.53, 77.27),
    ("delhi.mayur-vihar", "Delhi", "Mayur Vihar", 28.61, 77.29),
    ("delhi.laxmi-nagar", "Delhi", "Laxmi Nagar", 28.63, 77.28),
    ("delhi.shahdara", "Delhi", "Shahdara", 28.67, 77.29),
    ("gurugram.cyber-city", "Gurugram", "Cyber City", 28.49, 77.09),
    ("gurugram.golf-course-road", "Gurugram", "Golf Course Road", 28.45, 77.10),
    ("gurugram.old-gurugram", "Gurugram", "Old Gurugram", 28.46, 77.03),
    ("gurugram.sohna-road", "Gurugram", "Sohna Road", 28.42, 77.04),
    ("noida.sector-18", "Noida", "Sector 18", 28.57, 77.32),
    ("noida.sector-62", "Noida", "Sector 62", 28.62, 77.36),
    ("noida.greater-noida", "Noida", "Greater Noida", 28.47, 77.50),
    ("ghaziabad.indirapuram", "Ghaziabad", "Indirapuram", 28.64, 77.37),
    ("ghaziabad.raj-nagar", "Ghaziabad", "Raj Nagar", 28.68, 77.45),
    ("faridabad.central", "Faridabad", "Central Faridabad", 28.41, 77.32),
]


def upgrade() -> None:
    areas = op.create_table(
        "areas",
        sa.Column("id", sa.String(48), nullable=False),
        sa.Column("city", sa.String(48), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("latitude", sa.Numeric(7, 4), nullable=False),
        sa.Column("longitude", sa.Numeric(7, 4), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_areas"),
    )
    op.bulk_insert(
        areas, [{"id": a, "city": c, "name": n, "latitude": la, "longitude": lo} for a, c, n, la, lo in AREAS]
    )

    op.create_table(
        "profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(40), nullable=False),
        sa.Column("gender", sa.String(16), nullable=False),
        sa.Column("interested_in", sa.ARRAY(sa.String(16)), nullable=False),
        sa.Column("intent", sa.String(16), nullable=False),
        sa.Column("bio", sa.String(500), nullable=True),
        sa.Column("area_id", sa.String(48), nullable=False),
        sa.Column("area_changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("visibility", sa.String(16), server_default="everyone", nullable=False),
        sa.Column("discovery_paused", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_profiles"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_profiles_user_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["area_id"], ["areas.id"], name="fk_profiles_area_id_areas", ondelete="RESTRICT"),
        sa.CheckConstraint("char_length(display_name) BETWEEN 1 AND 40", name=op.f("ck_profiles_display_name_length")),
        sa.CheckConstraint("char_length(bio) <= 500", name=op.f("ck_profiles_bio_length")),
        sa.CheckConstraint(
            "cardinality(interested_in) >= 1 AND interested_in <@ ARRAY['woman','man','nonbinary']::varchar[]",
            name=op.f("ck_profiles_interested_in_valid"),
        ),
        sa.CheckConstraint("gender IN ('woman', 'man', 'nonbinary')", name=op.f("ck_profiles_gender")),
        sa.CheckConstraint("intent IN ('marriage', 'long_term', 'figuring_out')", name=op.f("ck_profiles_intent")),
        sa.CheckConstraint("visibility IN ('everyone', 'liked_only')", name=op.f("ck_profiles_visibility")),
    )
    op.create_index("ix_profiles_area_id", "profiles", ["area_id"])

    op.create_table(
        "profile_prompts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("prompt_key", sa.String(32), nullable=False),
        sa.Column("answer", sa.String(200), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_profile_prompts"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.user_id"], name="fk_profile_prompts_user_id_profiles", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("user_id", "position", name="uq_profile_prompts_user_id_position"),
        sa.UniqueConstraint("user_id", "prompt_key", name="uq_profile_prompts_user_id_prompt_key"),
        sa.CheckConstraint("position BETWEEN 0 AND 2", name=op.f("ck_profile_prompts_position_range")),
        sa.CheckConstraint("char_length(answer) BETWEEN 1 AND 200", name=op.f("ck_profile_prompts_answer_length")),
    )
    op.create_index("ix_profile_prompts_user_id", "profile_prompts", ["user_id"])

    op.create_table(
        "photos",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("storage_key", sa.String(64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.LargeBinary(), nullable=False),
        sa.Column("moderation_state", sa.String(16), server_default="pending", nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_photos"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_photos_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("storage_key", name="uq_photos_storage_key"),
        sa.UniqueConstraint(
            "user_id", "position", name="uq_photos_user_id_position", deferrable=True, initially="IMMEDIATE"
        ),
        sa.CheckConstraint("position BETWEEN 0 AND 5", name=op.f("ck_photos_position_range")),
        sa.CheckConstraint("octet_length(sha256) = 32", name=op.f("ck_photos_sha256_length")),
        sa.CheckConstraint(
            "moderation_state IN ('pending', 'approved', 'rejected')", name=op.f("ck_photos_moderation_state")
        ),
    )
    op.create_index("ix_photos_user_id", "photos", ["user_id"])
    op.create_index("ix_photos_sha256", "photos", ["sha256"])

    role = runtime_role()
    op.execute(f'GRANT SELECT ON areas TO "{role}"')  # reference data: read-only for the app
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, profile_prompts, photos TO "{role}"')


def downgrade() -> None:
    op.drop_table("photos")
    op.drop_table("profile_prompts")
    op.drop_table("profiles")
    op.drop_table("areas")
