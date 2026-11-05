"""Deleted-account records, retention indexes, the expired-records function (stage 12, D083-D085).

`app_purge_expired_records()` deletes audit and moderation records older than
three years. The audit trail and moderation records stay append-only for the
app (SELECT and INSERT only): the function runs with its owner's rights
(SECURITY DEFINER), has the period fixed inside it and takes no arguments,
so the app can remove expired records but never recent ones.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.helpers import runtime_role

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PURGE_FUNCTION = """
CREATE FUNCTION app_purge_expired_records() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    audit_rows integer;
    moderation_rows integer;
BEGIN
    DELETE FROM audit_log WHERE created_at < now() - interval '3 years';
    GET DIAGNOSTICS audit_rows = ROW_COUNT;
    DELETE FROM moderation_actions WHERE created_at < now() - interval '3 years';
    GET DIAGNOSTICS moderation_rows = ROW_COUNT;
    RETURN audit_rows + moderation_rows;
END;
$$
"""


def upgrade() -> None:
    op.create_table(
        "deleted_accounts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("was_banned", sa.Boolean(), nullable=False),
        sa.Column("email_digest", sa.LargeBinary(), nullable=True),
        sa.Column("consents", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("keep_until", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_deleted_accounts"),
        sa.CheckConstraint(
            "email_digest IS NULL OR octet_length(email_digest) = 32",
            name=op.f("ck_deleted_accounts_email_digest_length"),
        ),
        sa.CheckConstraint("jsonb_typeof(consents) = 'array'", name=op.f("ck_deleted_accounts_consents_is_array")),
        sa.CheckConstraint("keep_until > deleted_at", name=op.f("ck_deleted_accounts_keep_after_deleted")),
    )
    op.create_index(
        "ix_deleted_accounts_email_digest",
        "deleted_accounts",
        ["email_digest"],
        postgresql_where=sa.text("email_digest IS NOT NULL"),
    )
    op.create_index("ix_deleted_accounts_keep_until", "deleted_accounts", ["keep_until"])

    # For the retention sweep.
    op.create_index("ix_matches_closed_at", "matches", ["closed_at"], postgresql_where=sa.text("closed_at IS NOT NULL"))
    op.create_index("ix_daily_picks_pick_date", "daily_picks", ["pick_date"])
    op.create_index("ix_sessions_revoked_at", "sessions", ["revoked_at"])
    op.create_index(
        "ix_reports_resolved_at", "reports", ["resolved_at"], postgresql_where=sa.text("resolved_at IS NOT NULL")
    )
    op.create_index(
        "ix_users_pending_created_at", "users", ["created_at"], postgresql_where=sa.text("status = 'pending'")
    )

    role = runtime_role()
    # A record is written once and deleted when it expires; never changed.
    op.execute(f'GRANT SELECT, INSERT, DELETE ON deleted_accounts TO "{role}"')
    op.execute(PURGE_FUNCTION)
    op.execute("REVOKE ALL ON FUNCTION app_purge_expired_records() FROM PUBLIC")
    op.execute(f'GRANT EXECUTE ON FUNCTION app_purge_expired_records() TO "{role}"')


def downgrade() -> None:
    op.execute("DROP FUNCTION app_purge_expired_records()")
    op.drop_index("ix_users_pending_created_at", table_name="users")
    op.drop_index("ix_reports_resolved_at", table_name="reports")
    op.drop_index("ix_sessions_revoked_at", table_name="sessions")
    op.drop_index("ix_daily_picks_pick_date", table_name="daily_picks")
    op.drop_index("ix_matches_closed_at", table_name="matches")
    op.drop_table("deleted_accounts")
