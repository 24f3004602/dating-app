"""Drop and recreate the browser-test database, so every e2e run starts empty.

Uses MIGRATIONS_DATABASE_URL (the owner role). Refuses any database whose
name does not end in `_e2e_test`. Run `alembic upgrade head` afterwards.
"""

from __future__ import annotations

import sys

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from app.config import get_settings


def main() -> int:
    settings = get_settings()
    if settings.migrations_database_url is None:
        print("MIGRATIONS_DATABASE_URL is required", file=sys.stderr)
        return 2
    url = make_url(settings.migrations_database_url.get_secret_value())
    name = url.database or ""
    if settings.is_production or not name.endswith("_e2e_test"):
        print(f"refusing to recreate {name!r}: e2e database names end in _e2e_test", file=sys.stderr)
        return 2
    admin = url.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False)
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
        conn.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'").format(sql.Identifier(name)))
    print(f"recreated {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
