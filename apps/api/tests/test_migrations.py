"""Migrations round-trip (upgrade, downgrade, upgrade) and match the models."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from app.config import Settings
from app.models import Base
from migrations.helpers import include_name
from tests.conftest import alembic_config, drop_database, recreate_database, with_database

APP_TABLES = {
    "users", "sessions", "one_time_codes", "audit_log", "consents", "areas", "profiles", "profile_prompts", "photos",
    "preferences", "daily_picks", "interactions", "blocks", "matches", "messages", "match_reads",
}  # fmt: skip
JOB_TABLES = {"procrastinate_jobs", "procrastinate_events", "procrastinate_periodic_defers", "procrastinate_workers"}
HEAD = APP_TABLES | JOB_TABLES | {"alembic_version"}


@pytest.fixture
def scratch(base_settings: Settings) -> Iterator[tuple[str, Engine]]:
    assert base_settings.migrations_database_url is not None
    owner = base_settings.migrations_database_url.get_secret_value()
    name = "datingapp_migrations_test"
    recreate_database(owner, name)
    url = with_database(owner, name)
    engine = create_engine(url, poolclass=NullPool)
    try:
        yield url, engine
    finally:
        engine.dispose()
        drop_database(owner, name)


def tables(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def test_upgrade_downgrade_upgrade(scratch: tuple[str, Engine], base_settings: Settings) -> None:
    url, engine = scratch
    cfg = alembic_config(url, base_settings.db_runtime_role)

    command.upgrade(cfg, "head")
    assert tables(engine) == HEAD

    command.downgrade(cfg, "base")
    assert tables(engine) == {"alembic_version"}
    with engine.connect() as conn:
        leftovers = (
            conn.execute(text("SELECT count(*) FROM pg_proc WHERE proname LIKE 'procrastinate%'")).scalar_one()
            + conn.execute(text("SELECT count(*) FROM pg_type WHERE typname LIKE 'procrastinate%'")).scalar_one()
        )
    assert leftovers == 0

    command.upgrade(cfg, "head")
    assert tables(engine) == HEAD
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0007"


def test_migrated_schema_matches_the_models(scratch: tuple[str, Engine], base_settings: Settings) -> None:
    url, engine = scratch
    command.upgrade(alembic_config(url, base_settings.db_runtime_role), "head")
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True, "include_name": include_name})
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == []


def test_runtime_role_grants(scratch: tuple[str, Engine], base_settings: Settings) -> None:
    url, engine = scratch
    role = base_settings.db_runtime_role
    command.upgrade(alembic_config(url, role), "head")
    check = text("SELECT has_table_privilege(:role, :table, :priv)")
    with engine.connect() as conn:
        dml_tables = (
            "users", "sessions", "one_time_codes", "consents", "profiles", "profile_prompts", "photos",
            "preferences", "daily_picks", "interactions", "blocks", "matches", "messages", "match_reads",
        )  # fmt: skip
        for table in (*dml_tables, *sorted(JOB_TABLES)):
            for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                assert conn.execute(check, {"role": role, "table": table, "priv": priv}).scalar_one(), (table, priv)
            assert not conn.execute(check, {"role": role, "table": table, "priv": "TRUNCATE"}).scalar_one()
        for priv, allowed in {
            "SELECT": True,
            "INSERT": True,
            "UPDATE": False,
            "DELETE": False,
            "TRUNCATE": False,
        }.items():
            assert conn.execute(check, {"role": role, "table": "audit_log", "priv": priv}).scalar_one() is allowed
        assert not conn.execute(
            text("SELECT has_schema_privilege(:role, 'public', 'CREATE')"), {"role": role}
        ).scalar_one()
        # Areas are reference data: read-only for the app.
        for priv, allowed in {"SELECT": True, "INSERT": False, "UPDATE": False, "DELETE": False}.items():
            assert conn.execute(check, {"role": role, "table": "areas", "priv": priv}).scalar_one() is allowed


def test_offline_sql_renders(base_settings: Settings, capsys: pytest.CaptureFixture[str]) -> None:
    """`alembic upgrade --sql` works, for DBAs who review DDL before applying it."""
    url = with_database(str(base_settings.migrations_database_url.get_secret_value()), "unused")  # type: ignore[union-attr]
    command.upgrade(alembic_config(url, base_settings.db_runtime_role), "head", sql=True)
    out = capsys.readouterr().out
    assert "CREATE TABLE users" in out
    assert "CREATE UNIQUE INDEX uq_one_time_codes_live" in out
    assert f'GRANT SELECT, INSERT ON audit_log TO "{base_settings.db_runtime_role}"' in out
