"""Rate limiter failure mode, Redis key privacy, providers, and no personal
data in logs across the whole auth flow (SEC-1)."""

from __future__ import annotations

import io
import json
import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from app.providers.email import ConsoleEmailSender, MemoryEmailSender, create_email_sender
from app.providers.identity import NoIdentityVerifier
from app.providers.sms import MemorySmsSender, SmsMessage, UnavailableSmsSender
from tests.conftest import MigratedDatabase, close_app
from tests.support import OTHER_PASSWORD, PASSWORD, FrozenClock, JobRunner, bearer, register, signup


async def test_auth_fails_closed_when_redis_is_down(test_db: MigratedDatabase, clock: FrozenClock) -> None:
    settings = test_db.settings.model_copy(update={"redis_url": SecretStr("redis://127.0.0.1:1/0")})
    application = create_app(settings, configure_logs=False)
    try:
        async with AsyncClient(transport=ASGITransport(app=application), base_url="http://testserver") as c:
            for path, body in (
                ("/v1/auth/login", {"email": "a@example.com", "password": PASSWORD}),
                ("/v1/auth/resend-code", {"email": "a@example.com"}),
                ("/v1/auth/password-reset/request", {"email": "a@example.com"}),
            ):
                r = await c.post(path, json=body)
                assert r.status_code == 503, path
                assert r.json()["code"] == "rate_limit_unavailable"
                assert r.headers["retry-after"] == "30"
            r = await register(c, settings, clock, "a@example.com")
            assert r.status_code == 503
    finally:
        await close_app(application)


async def test_redis_keys_hold_no_email_or_ip(app: FastAPI, client: AsyncClient, clock: FrozenClock) -> None:
    await register(client, app.state.settings, clock, "keyed.person@example.com")
    await client.post("/v1/auth/login", json={"email": "keyed.person@example.com", "password": OTHER_PASSWORD})
    keys = [k.decode() async for k in app.state.redis.scan_iter(match=f"{app.state.settings.rate_limit_prefix}:*")]
    assert keys
    for key in keys:
        assert "keyed" not in key
        assert "example.com" not in key
        assert "127.0.0.1" not in key


async def test_no_personal_data_in_logs_across_the_auth_flow(
    client: AsyncClient, jobs: JobRunner, captured_logs: io.StringIO
) -> None:
    email = "private.person@example.com"
    session = await signup(client, jobs, email)
    token = session["token"]
    await client.get("/v1/me", headers=bearer(token))
    await client.post("/v1/auth/login", json={"email": email, "password": OTHER_PASSWORD})
    await client.post("/v1/auth/password-reset/request", json={"email": email})
    await jobs.run()
    await client.post(
        "/v1/auth/password-reset/confirm", json={"email": email, "code": jobs.last_code, "new_password": OTHER_PASSWORD}
    )
    await client.post("/v1/auth/logout-all", headers=bearer(token))

    output = captured_logs.getvalue()
    routes = {json.loads(line).get("route") for line in output.splitlines() if line.strip()}
    assert "/v1/auth/verify-email" in routes  # the flow really ran through the logger
    for secret in (email, "private.person", PASSWORD, OTHER_PASSWORD, token, *jobs.codes):
        assert secret not in output, f"{secret!r} leaked into logs"


# --- providers ---------------------------------------------------------------------


def test_console_email_is_refused_in_production(test_db: MigratedDatabase) -> None:
    prod_like = test_db.settings.model_copy(update={"app_env": "production", "email_backend": "console"})
    with pytest.raises(RuntimeError, match="not allowed in production"):
        create_email_sender(prod_like)
    assert isinstance(create_email_sender(test_db.settings), MemoryEmailSender)
    dev = test_db.settings.model_copy(update={"app_env": "development", "email_backend": "console"})
    assert isinstance(create_email_sender(dev), ConsoleEmailSender)


def test_production_settings_refuse_dev_shortcuts() -> None:
    base = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql+psycopg://u:p@h/d",
        "REDIS_URL": "redis://h",
        "APP_SECRET_KEY": "x" * 32,
    }
    with pytest.raises(ValueError, match="real email backend") as info:
        Settings.model_validate(base)
    message = str(info.value)
    assert "test password-hash profile" not in message  # default profile is the real one
    assert "non-draft" in message  # legal documents are still drafts


async def test_sms_and_identity_abstractions_never_pretend() -> None:
    with pytest.raises(ValueError, match=r"E\.164"):
        SmsMessage(to="9876543210", text="hi")
    memory = MemorySmsSender()
    await memory.send(SmsMessage(to="+919876543210", text="hi", dlt_template_id="1107000000000000000"))
    assert len(memory.outbox) == 1
    with pytest.raises(RuntimeError, match="not configured"):
        await UnavailableSmsSender().send(SmsMessage(to="+919876543210", text="hi"))
    assert await NoIdentityVerifier().status(uuid.uuid4()) == "not_checked"


def test_secret_key_must_be_long() -> None:
    with pytest.raises(ValueError, match="app_secret_key"):
        Settings.model_validate(
            {"DATABASE_URL": "postgresql+psycopg://u:p@h/d", "REDIS_URL": "redis://h", "APP_SECRET_KEY": "short"}
        )
