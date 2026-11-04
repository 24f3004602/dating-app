"""Create the database roles and the development database (dev and CI only).

Production roles are provisioned by the hosting setup, never by this script.

    uv run python scripts/bootstrap_db.py --admin-url postgresql://postgres:...@localhost:55432/postgres

Reads DATABASE_URL (runtime role) and MIGRATIONS_DATABASE_URL (owner role)
from the environment or `.env`. Idempotent: existing roles get their
password reset to the configured one.

- owner role: LOGIN, CREATEDB (so the test suite can create its own
  database); owns the database and its schema; runs migrations.
- runtime role: LOGIN only; receives DML grants from migrations.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

import psycopg
from psycopg import sql
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

from app.config import Settings, get_settings


class BootstrapSettings(BaseSettings):
    """Kept out of the app's Settings: the app never sees admin credentials."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    bootstrap_admin_url: SecretStr | None = None


class BootstrapError(Exception):
    pass


@dataclass(frozen=True)
class Targets:
    database: str
    owner: str
    owner_password: str
    runtime: str
    runtime_password: str


def targets_from(settings: Settings) -> Targets:
    if settings.is_production:
        raise BootstrapError("refusing to run in production")
    if settings.migrations_database_url is None:
        raise BootstrapError("MIGRATIONS_DATABASE_URL is required")
    runtime = make_url(settings.database_url.get_secret_value())
    owner = make_url(settings.migrations_database_url.get_secret_value())
    if runtime.database != owner.database:
        raise BootstrapError("DATABASE_URL and MIGRATIONS_DATABASE_URL must name the same database")
    if runtime.username != settings.db_runtime_role:
        raise BootstrapError("DATABASE_URL's user must equal DB_RUNTIME_ROLE")
    if not (runtime.username and runtime.password and owner.username and owner.password and owner.database):
        raise BootstrapError("both URLs need a user, a password and a database")
    return Targets(owner.database, owner.username, owner.password, runtime.username, runtime.password)


def ensure_role(cur: psycopg.Cursor[tuple[object, ...]], name: str, password: str, *, createdb: bool) -> None:
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (name,))
    verb = "ALTER" if cur.fetchone() else "CREATE"
    options = sql.SQL("LOGIN CREATEDB") if createdb else sql.SQL("LOGIN NOCREATEDB")
    cur.execute(
        sql.SQL("{} ROLE {} WITH {} NOSUPERUSER NOCREATEROLE PASSWORD {}").format(
            sql.SQL(verb), sql.Identifier(name), options, sql.Literal(password)
        )
    )
    print(f"role {name}: {verb.lower()}d")


def bootstrap(admin_url: str, t: Targets) -> None:
    plain = admin_url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(plain, autocommit=True) as conn, conn.cursor() as cur:
        ensure_role(cur, t.owner, t.owner_password, createdb=True)
        ensure_role(cur, t.runtime, t.runtime_password, createdb=False)
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (t.database,))
        if cur.fetchone():
            print(f"database {t.database}: exists")
            return
        cur.execute(
            sql.SQL("CREATE DATABASE {} OWNER {} ENCODING 'UTF8' TEMPLATE template0").format(
                sql.Identifier(t.database), sql.Identifier(t.owner)
            )
        )
        print(f"database {t.database}: created")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-url", help="defaults to BOOTSTRAP_ADMIN_URL")
    args = parser.parse_args()
    configured = BootstrapSettings().bootstrap_admin_url
    admin_url = args.admin_url or (configured.get_secret_value() if configured else None)
    try:
        if not admin_url:
            raise BootstrapError("--admin-url or BOOTSTRAP_ADMIN_URL is required")
        bootstrap(admin_url, targets_from(get_settings()))
    except BootstrapError as exc:
        print(f"bootstrap_db: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
