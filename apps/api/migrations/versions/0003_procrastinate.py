"""Job queue schema: procrastinate 3.10.0 (D035).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-04

The schema SQL is vendored in migrations/sql so this revision never changes
when the package is upgraded. The runtime role (app and worker) gets DML on
procrastinate's tables; its functions are executable by PUBLIC by default.
"""

from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from alembic import op

from migrations.helpers import runtime_role

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA_SQL = Path(__file__).resolve().parents[1] / "sql" / "procrastinate-3.10.0-schema.sql"
TABLES = ("procrastinate_jobs", "procrastinate_events", "procrastinate_periodic_defers", "procrastinate_workers")


def upgrade() -> None:
    op.execute(sa.text(SCHEMA_SQL.read_text(encoding="utf-8")))
    role = runtime_role()
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON {", ".join(TABLES)} TO "{role}"')
    op.execute(
        "DO $$ DECLARE s text; BEGIN "
        "FOR s IN SELECT sequence_name FROM information_schema.sequences "
        "WHERE sequence_schema = 'public' AND sequence_name LIKE 'procrastinate%' LOOP "
        f"EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO \"{role}\"', s); "
        "END LOOP; END $$"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {', '.join(TABLES)} CASCADE")
    # Functions first (they reference the types), then the types.
    op.execute(
        "DO $$ DECLARE r record; BEGIN "
        "FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname LIKE 'procrastinate%' LOOP "
        "EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE'; "
        "END LOOP; END $$"
    )
    op.execute(
        "DROP TYPE IF EXISTS procrastinate_job_to_defer_v1, procrastinate_job_event_type, "
        "procrastinate_job_status CASCADE"
    )
