"""/healthz and /readyz with dependencies up and down."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from app.modules.health import router as health_module
from tests.conftest import MigratedDatabase, close_app

# Port 1 on loopback: nothing listens there, so connections are refused fast.
DEAD_DB = "postgresql+psycopg://nobody:nothing@127.0.0.1:1/nowhere"
DEAD_REDIS = "redis://127.0.0.1:1/0"


@pytest.fixture
def client_for(test_db: MigratedDatabase) -> Callable[..., AsyncIterator[AsyncClient]]:
    async def make(**overrides: object) -> AsyncIterator[AsyncClient]:
        settings: Settings = test_db.settings.model_copy(update=overrides)
        app = create_app(settings, configure_logs=False)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
                yield c
        finally:
            await close_app(app)

    return make


async def test_healthz_ok(client: AsyncClient) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_readyz_ok_when_database_and_redis_are_up(client: AsyncClient) -> None:
    r = await client.get("/readyz")
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "ready", "checks": {"database": "ok", "redis": "ok"}}


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"database_url": SecretStr(DEAD_DB)}, {"database": "fail", "redis": "ok"}),
        ({"redis_url": SecretStr(DEAD_REDIS)}, {"database": "ok", "redis": "fail"}),
        (
            {"database_url": SecretStr(DEAD_DB), "redis_url": SecretStr(DEAD_REDIS)},
            {"database": "fail", "redis": "fail"},
        ),
    ],
    ids=["database-down", "redis-down", "both-down"],
)
async def test_readyz_503_when_a_dependency_is_down(
    client_for: Callable[..., AsyncIterator[AsyncClient]], overrides: dict[str, object], expected: dict[str, str]
) -> None:
    async for c in client_for(**overrides):
        r = await c.get("/readyz")
        assert r.status_code == 503
        assert r.headers["content-type"] == "application/problem+json"
        body = r.json()
        assert body["code"] == "not_ready"
        assert body["checks"] == expected
        # No driver error text (hostnames, users) leaks to the client.
        assert "127.0.0.1" not in r.text
        assert "nobody" not in r.text
        # Liveness is unaffected by dependencies.
        assert (await c.get("/healthz")).status_code == 200


async def test_readyz_times_out_a_hanging_dependency(
    app: FastAPI, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def hang(_: object) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(health_module, "_check_database", hang)
    app.state.settings = app.state.settings.model_copy(update={"readiness_timeout_s": 0.05})
    r = await client.get("/readyz")
    assert r.status_code == 503
    assert r.json()["checks"] == {"database": "fail", "redis": "ok"}
