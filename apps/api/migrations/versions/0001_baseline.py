"""Baseline: users, sessions, one_time_codes, audit_log (D029).

Revision ID: 0001
Revises:
Create Date: 2026-11-04

Privileges: the runtime role gets DML on the account tables, and only
INSERT and SELECT on audit_log, so the trail is append-only for the app.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_PK = sa.text("gen_random_uuid()")


def _runtime_role() -> str:
    ctx = op.get_context()
    role = ctx.config.attributes["runtime_role"] if ctx.config is not None else None
    if not isinstance(role, str) or not role.replace("_", "").isalnum() or not role.islower():
        raise RuntimeError("runtime role must be a lowercase identifier")
    return role


def _ts(name: str, *, nullable: bool = True, default_now: bool = False) -> sa.Column[Any]:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=sa.func.now() if default_now else None,
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=UUID_PK, nullable=False),
        sa.Column("email_normalized", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("birthdate", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("role", sa.String(16), server_default="member", nullable=False),
        _ts("email_verified_at"),
        _ts("last_active_at"),
        _ts("deletion_requested_at"),
        _ts("updated_at", nullable=False, default_now=True),
        _ts("created_at", nullable=False, default_now=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email_normalized", name="uq_users_email_normalized"),
        sa.CheckConstraint("email_normalized = lower(email_normalized)", name=op.f("ck_users_email_lowercase")),
        sa.CheckConstraint("char_length(email_normalized) BETWEEN 3 AND 254", name=op.f("ck_users_email_length")),
        sa.CheckConstraint("birthdate >= DATE '1900-01-01'", name=op.f("ck_users_birthdate_plausible")),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'suspended', 'banned', 'deactivated')", name=op.f("ck_users_status")
        ),
        sa.CheckConstraint("role IN ('member', 'moderator', 'admin')", name=op.f("ck_users_role")),
    )
    op.create_index("ix_users_deletion_requested_at", "users", ["deletion_requested_at"])

    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), server_default=UUID_PK, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("client", sa.String(16), nullable=False),
        sa.Column("user_agent", sa.String(64), nullable=True),
        _ts("expires_at", nullable=False),
        _ts("revoked_at"),
        _ts("last_used_at"),
        _ts("created_at", nullable=False, default_now=True),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_sessions_user_id_users", ondelete="CASCADE"),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        sa.CheckConstraint("octet_length(token_hash) = 32", name=op.f("ck_sessions_token_hash_sha256")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_sessions_expires_after_created")),
        sa.CheckConstraint("client IN ('mobile', 'web_admin')", name=op.f("ck_sessions_client")),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    op.create_table(
        "one_time_codes",
        sa.Column("id", sa.Uuid(), server_default=UUID_PK, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("code_hash", sa.LargeBinary(), nullable=False),
        _ts("expires_at", nullable=False),
        _ts("consumed_at"),
        sa.Column("attempts", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        _ts("created_at", nullable=False, default_now=True),
        sa.PrimaryKeyConstraint("id", name="pk_one_time_codes"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_one_time_codes_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("octet_length(code_hash) = 32", name=op.f("ck_one_time_codes_code_hash_hmac_sha256")),
        sa.CheckConstraint("attempts >= 0", name=op.f("ck_one_time_codes_attempts_non_negative")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_one_time_codes_expires_after_created")),
        sa.CheckConstraint("purpose IN ('verify_email', 'reset_password')", name=op.f("ck_one_time_codes_purpose")),
    )
    op.create_index("ix_one_time_codes_user_id", "one_time_codes", ["user_id"])
    op.create_index("ix_one_time_codes_expires_at", "one_time_codes", ["expires_at"])
    op.create_index(
        "uq_one_time_codes_live",
        "one_time_codes",
        ["user_id", "purpose"],
        unique=True,
        postgresql_where=sa.text("consumed_at IS NULL"),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), server_default=UUID_PK, nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column(
            "metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        _ts("created_at", nullable=False, default_now=True),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
        sa.CheckConstraint(
            "action ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'", name=op.f("ck_audit_log_action_format")
        ),
        sa.CheckConstraint("jsonb_typeof(metadata) = 'object'", name=op.f("ck_audit_log_metadata_is_object")),
    )
    op.create_index("ix_audit_log_target", "audit_log", ["target_type", "target_id", "created_at"])
    op.create_index("ix_audit_log_actor", "audit_log", ["actor_id", "created_at"])

    role = _runtime_role()
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, one_time_codes TO "{role}"')
    op.execute(f'GRANT SELECT, INSERT ON audit_log TO "{role}"')


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("one_time_codes")
    op.drop_table("sessions")
    op.drop_table("users")
