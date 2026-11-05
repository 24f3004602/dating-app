"""Test harness: a real PostgreSQL test database, migrated once per session,
with every test wrapped in a transaction that is rolled back.

- The owner role (MIGRATIONS_DATABASE_URL) drops and recreates the test
  database and runs the migrations, exactly as a deploy would.
- The app and the DB tests connect as the runtime role (DATABASE_URL), so a
  missing GRANT fails a test.
"""

from __future__ import annotations

import asyncio
import dataclasses
import io
import logging
import sys
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from pathlib import Path

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg import sql
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.exceptions import RedisError
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import Settings
from app.db import UTC_SESSION
from app.logs import QUIET_LOGGERS, JsonFormatter, quiet_library_loggers
from app.main import create_app
from tests.probes import router as probe_router
from tests.support import FrozenClock, JobRunner

API_DIR = Path(__file__).resolve().parents[1]

if sys.platform == "win32":
    # psycopg's async mode cannot run on Windows' default Proactor loop.
    def pytest_asyncio_loop_factories(config: pytest.Config, item: pytest.Item) -> dict[str, object]:
        return {"selector": asyncio.SelectorEventLoop}


class _TestEnv(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    test_database_name: str | None = None


def with_database(url: str, name: str) -> str:
    return make_url(url).set(database=name).render_as_string(hide_password=False)


def plain(url: str) -> str:
    """SQLAlchemy URL to a libpq URL for psycopg.connect."""
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def recreate_database(owner_url: str, name: str) -> None:
    if not name.endswith("_test"):
        raise RuntimeError(f"refusing to drop {name!r}: test database names must end in _test")
    with psycopg.connect(plain(with_database(owner_url, "postgres")), autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
        conn.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'").format(sql.Identifier(name)))


def drop_database(owner_url: str, name: str) -> None:
    if not name.endswith("_test"):
        raise RuntimeError(f"refusing to drop {name!r}")
    with psycopg.connect(plain(with_database(owner_url, "postgres")), autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


def alembic_config(owner_url: str, runtime_role: str) -> Config:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = owner_url
    cfg.attributes["runtime_role"] = runtime_role
    return cfg


@dataclass(frozen=True)
class MigratedDatabase:
    name: str
    settings: Settings
    owner_url: str
    runtime_url: str


@pytest.fixture(scope="session")
def base_settings() -> Settings:
    settings = Settings()
    if settings.is_production:
        raise RuntimeError("refusing to run tests with APP_ENV=production")
    if settings.migrations_database_url is None:
        raise RuntimeError("MIGRATIONS_DATABASE_URL is required for tests")
    return settings


@pytest.fixture(scope="session")
def test_db(base_settings: Settings) -> Iterator[MigratedDatabase]:
    assert base_settings.migrations_database_url is not None
    owner = base_settings.migrations_database_url.get_secret_value()
    runtime = base_settings.database_url.get_secret_value()
    name = _TestEnv().test_database_name or f"{make_url(runtime).database}_test"
    owner_url = with_database(owner, name)
    runtime_url = with_database(runtime, name)

    recreate_database(owner, name)
    command.upgrade(alembic_config(owner_url, base_settings.db_runtime_role), "head")
    settings = base_settings.model_copy(
        update={
            "app_env": "test",
            "database_url": SecretStr(runtime_url),
            "migrations_database_url": SecretStr(owner_url),
            "password_hash_profile": "test",
            "email_backend": "memory",
            "storage_backend": "memory",
        }
    )
    yield MigratedDatabase(name=name, settings=settings, owner_url=owner_url, runtime_url=runtime_url)
    drop_database(owner, name)


@pytest.fixture
async def db_conn(test_db: MigratedDatabase) -> AsyncIterator[AsyncConnection]:
    """A runtime-role connection inside a transaction that is rolled back."""
    engine = create_async_engine(
        test_db.runtime_url, poolclass=NullPool, hide_parameters=True, connect_args=UTC_SESSION
    )
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            try:
                yield conn
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
async def session(db_conn: AsyncConnection) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint") as s:
        yield s


async def close_app(app: FastAPI) -> None:
    await app.state.realtime.aclose()
    await app.state.redis.aclose()
    await app.state.engine.dispose()


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock()


@pytest.fixture
def db(db_conn: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    """Short-lived sessions on the test transaction (open one per check)."""
    return async_sessionmaker(bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint")


@pytest.fixture
async def app(
    test_db: MigratedDatabase, db: async_sessionmaker[AsyncSession], clock: FrozenClock
) -> AsyncIterator[FastAPI]:
    # A rate-limit namespace per test, deleted afterwards.
    prefix = f"rl-test-{uuid.uuid4().hex[:12]}"
    application = create_app(test_db.settings.model_copy(update={"rate_limit_prefix": prefix}), configure_logs=False)
    # Request sessions join the per-test transaction: commits become
    # savepoint releases and everything is rolled back afterwards.
    application.state.session_factory = db
    application.state.auth = dataclasses.replace(application.state.auth, clock=clock)
    yield application
    try:
        keys = [k async for k in application.state.redis.scan_iter(match=f"{prefix}:*")]
        if keys:
            await application.state.redis.delete(*keys)
    except RedisError:
        pass  # tests that point at a dead Redis have nothing to clean
    await close_app(application)


@pytest.fixture
def jobs(app: FastAPI, db: async_sessionmaker[AsyncSession], clock: FrozenClock) -> JobRunner:
    return JobRunner(db, app.state.settings, clock, app.state.storage)


@pytest.fixture
def with_probes(app: FastAPI) -> FastAPI:
    app.include_router(probe_router)
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


@pytest.fixture
def captured_logs() -> Iterator[io.StringIO]:
    """Everything logged during the test at DEBUG, with the production
    formatter and the production library-logger levels."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    old_root = root.level
    old_quiet = {name: logging.getLogger(name).level for name in QUIET_LOGGERS}
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    quiet_library_loggers()
    try:
        yield stream
    finally:
        root.removeHandler(handler)
        root.setLevel(old_root)
        for name, level in old_quiet.items():
            logging.getLogger(name).setLevel(level)
