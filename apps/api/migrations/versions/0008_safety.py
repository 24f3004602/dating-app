"""Reports, moderation actions, removed messages (stage 11, D079-D081).

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=True),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(16), nullable=False),
        sa.Column("details", sa.String(1000), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("evidence_text", sa.String(2000), nullable=True),
        sa.Column("photo_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("priority", sa.SmallInteger(), nullable=False),
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_reports"),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"], name="fk_reports_reporter_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["subject_id"], ["users.id"], name="fk_reports_subject_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["message_id"], ["messages.id"], name="fk_reports_message_id_messages", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], name="fk_reports_photo_id_photos", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name="fk_reports_assignee_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["users.id"], name="fk_reports_resolved_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint("char_length(details) <= 1000", name=op.f("ck_reports_details_length")),
        sa.CheckConstraint("priority BETWEEN 1 AND 3", name=op.f("ck_reports_priority_range")),
        sa.CheckConstraint(
            "(resolved_at IS NULL) = (status IN ('open', 'in_review'))", name=op.f("ck_reports_resolved_consistent")
        ),
        sa.CheckConstraint(
            "reason IN ('fake', 'harassment', 'explicit', 'scam', 'underage', 'hate', 'other')",
            name=op.f("ck_reports_reason"),
        ),
        sa.CheckConstraint("status IN ('open', 'in_review', 'actioned', 'dismissed')", name=op.f("ck_reports_status")),
    )
    for column in ("reporter_id", "subject_id", "message_id", "photo_id", "assignee_id", "resolved_by"):
        op.create_index(f"ix_reports_{column}", "reports", [column])
    op.create_index("ix_reports_queue", "reports", ["status", "priority", "created_at"])

    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("moderator_id", sa.Uuid(), nullable=False),
        sa.Column("target_user_id", sa.Uuid(), nullable=True),
        sa.Column("report_id", sa.Uuid(), nullable=True),
        sa.Column("photo_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_moderation_actions"),
        sa.CheckConstraint("char_length(note) <= 500", name=op.f("ck_moderation_actions_note_length")),
        sa.CheckConstraint(
            "action IN ('dismiss', 'warn', 'remove_photo', 'remove_message', 'suspend', 'ban', 'reinstate', "
            "'approve_photo', 'reject_photo')",
            name=op.f("ck_moderation_actions_action"),
        ),
    )
    op.create_index("ix_moderation_actions_moderator_id", "moderation_actions", ["moderator_id"])
    op.create_index("ix_moderation_actions_report_id", "moderation_actions", ["report_id"])
    op.create_index("ix_moderation_actions_target", "moderation_actions", ["target_user_id", "created_at"])

    role = runtime_role()
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON reports TO "{role}"')
    # Append-only for the app, like audit_log.
    op.execute(f'GRANT SELECT, INSERT ON moderation_actions TO "{role}"')


def downgrade() -> None:
    op.drop_table("moderation_actions")
    op.drop_table("reports")
    op.drop_column("messages", "removed_at")
