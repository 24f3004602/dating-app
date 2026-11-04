"""Alembic environment.

Connects with the schema-owner role (MIGRATIONS_DATABASE_URL) using psycopg's
sync mode (D022). Tests may pass `database_url` and `runtime_role` through
`config.attributes` instead.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _url_and_role() -> tuple[str, str]:
    url = config.attributes.get("database_url")
    role = config.attributes.get("runtime_role")
    if url is None or role is None:
        settings = get_settings()
        if settings.migrations_database_url is None:
            raise RuntimeError("MIGRATIONS_DATABASE_URL is not set")
        url = url or settings.migrations_database_url.get_secret_value()
        role = role or settings.db_runtime_role
    config.attributes["runtime_role"] = role
    return str(url), str(role)


def run_migrations_offline() -> None:
    url, _ = _url_and_role()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url, _ = _url_and_role()
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
