"""The blue tick (stage 29b, D164): photo checks, and profiles.photo_verified_at.

A selfie making a gesture the server chose, compared with the member's photos by our staff;
kept only until the decision (`storage_key` is set only while the check is pending).

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("photo_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "photo_checks",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("gesture", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("storage_key", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(16), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_photo_checks"),
        sa.UniqueConstraint("storage_key", name="uq_photo_checks_storage_key"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_photo_checks_user_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name="fk_photo_checks_decided_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            "gesture IN ('thumbs_up', 'two_fingers', 'three_fingers', 'open_palm', 'hand_on_head', 'chin_on_hand')",
            name=op.f("ck_photo_checks_gesture"),
        ),
        sa.CheckConstraint(
            "state IN ('awaiting', 'pending', 'approved', 'rejected', 'cancelled', 'expired')",
            name=op.f("ck_photo_checks_state"),
        ),
        sa.CheckConstraint(
            "reason IN ('face_mismatch', 'gesture_missing', 'unclear')", name=op.f("ck_photo_checks_reason")
        ),
        sa.CheckConstraint(
            "(state = 'pending') = (storage_key IS NOT NULL)", name=op.f("ck_photo_checks_selfie_while_pending")
        ),
        sa.CheckConstraint(
            "(state = 'awaiting' AND submitted_at IS NULL)"
            " OR (state IN ('pending', 'approved', 'rejected', 'cancelled') AND submitted_at IS NOT NULL)"
            " OR state = 'expired'",
            name=op.f("ck_photo_checks_submitted"),
        ),
        sa.CheckConstraint(
            "(state IN ('approved', 'rejected')) = (decided_at IS NOT NULL)", name=op.f("ck_photo_checks_decided")
        ),
        sa.CheckConstraint(
            "(state = 'rejected') = (reason IS NOT NULL)", name=op.f("ck_photo_checks_reason_when_rejected")
        ),
    )
    op.create_index("ix_photo_checks_user_id", "photo_checks", ["user_id"])
    op.create_index(
        "uq_photo_checks_open",
        "photo_checks",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("state IN ('awaiting', 'pending')"),
    )
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON photo_checks TO "{runtime_role()}"')


def downgrade() -> None:
    op.drop_table("photo_checks")
    op.drop_column("profiles", "photo_verified_at")
