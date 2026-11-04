"""F01 sign-in, sessions, logout, password reset, lockout."""

from __future__ import annotations

import hashlib

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.accounts.models import User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth.models import Session
from app.modules.auth.passwords import Passwords
from tests.support import (
    OTHER_PASSWORD,
    PASSWORD,
    FrozenClock,
    JobRunner,
    bearer,
    register,
    signup,
    without_request_id,
)

Db = async_sessionmaker[AsyncSession]


async def login(client: AsyncClient, email: str, password: str = PASSWORD, **headers: str) -> object:
    return await client.post("/v1/auth/login", json={"email": email, "password": password}, headers=headers)


async def set_user(db: Db, email: str, **values: object) -> None:
    async with db() as s:
        await s.execute(update(User).where(User.email_normalized == email).values(**values))
        await s.commit()


async def get_user(db: Db, email: str) -> User:
    async with db() as s:
        return (await s.execute(select(User).where(User.email_normalized == email))).scalar_one()


# --- login -----------------------------------------------------------------------


async def test_login_issues_a_session_and_stores_only_its_hash(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    await signup(client, jobs, "member@example.com")
    r = await client.post(
        "/v1/auth/login",
        json={"email": "MEMBER@example.com", "password": PASSWORD},
        headers={"user-agent": "okhttp/4.12.0 (Linux; Android 14; secret-device-id-123)"},
    )
    assert r.status_code == 200
    token = r.json()["token"]
    assert len(token) >= 43  # 256 bits, URL-safe base64
    async with db() as s:
        rows = (await s.execute(select(Session).order_by(Session.created_at))).scalars().all()
    stored = rows[-1]
    assert stored.token_hash == hashlib.sha256(token.encode()).digest()
    assert stored.user_agent == "okhttp/4.12.0"  # first product token only
    me = await client.get("/v1/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.json()["email"] == "member@example.com"


async def test_wrong_password_and_unknown_email_look_the_same(client: AsyncClient, jobs: JobRunner) -> None:
    await signup(client, jobs, "member@example.com")
    wrong = await client.post("/v1/auth/login", json={"email": "member@example.com", "password": OTHER_PASSWORD})
    unknown = await client.post("/v1/auth/login", json={"email": "nobody@example.com", "password": OTHER_PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert without_request_id(wrong) == without_request_id(unknown)


async def test_account_state_is_only_told_to_the_password_holder(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner, db: Db
) -> None:
    await register(client, app.state.settings, clock, "pending@example.com")
    r = await client.post("/v1/auth/login", json={"email": "pending@example.com", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["code"] == "email_not_verified"
    r = await client.post("/v1/auth/login", json={"email": "pending@example.com", "password": OTHER_PASSWORD})
    assert r.status_code == 401

    await signup(client, jobs, "suspended@example.com")
    await set_user(db, "suspended@example.com", status=UserStatus.suspended)
    r = await client.post("/v1/auth/login", json={"email": "suspended@example.com", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["code"] == "account_suspended"


async def test_login_is_rate_limited(client: AsyncClient, jobs: JobRunner) -> None:
    await signup(client, jobs, "member@example.com")
    for _ in range(10):
        await client.post("/v1/auth/login", json={"email": "member@example.com", "password": OTHER_PASSWORD})
    r = await client.post("/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})
    assert r.status_code == 429  # even the right password, inside the window
    assert int(r.headers["retry-after"]) > 0


async def test_failures_reset_on_success_and_the_hash_is_upgraded(
    app: FastAPI, client: AsyncClient, jobs: JobRunner, db: Db
) -> None:
    await signup(client, jobs, "member@example.com")
    strong = Passwords("rfc9106_low_memory").hash(PASSWORD)
    await set_user(db, "member@example.com", failed_login_count=7, password_hash=strong)
    r = await client.post("/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})
    assert r.status_code == 200
    user = await get_user(db, "member@example.com")
    assert user.failed_login_count == 0
    assert user.password_hash != strong  # rehashed to the configured parameters
    assert app.state.auth.passwords.verify(user.password_hash, PASSWORD)


async def test_lockout_after_consecutive_failures_until_reset(
    app: FastAPI, client: AsyncClient, jobs: JobRunner, db: Db
) -> None:
    email = "locked@example.com"
    await signup(client, jobs, email)
    threshold = app.state.settings.login_lockout_threshold
    await set_user(db, email, failed_login_count=threshold - 1)

    r = await client.post("/v1/auth/login", json={"email": email, "password": OTHER_PASSWORD})
    assert r.status_code == 401
    await jobs.run()
    assert jobs.mail_to(email)[-1].subject.startswith("Password sign-in paused")
    # Now even the right password gets the same generic answer.
    r = await client.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_credentials"

    await client.post("/v1/auth/password-reset/request", json={"email": email})
    await jobs.run()
    r = await client.post(
        "/v1/auth/password-reset/confirm", json={"email": email, "code": jobs.last_code, "new_password": OTHER_PASSWORD}
    )
    assert r.status_code == 204
    r = await client.post("/v1/auth/login", json={"email": email, "password": OTHER_PASSWORD})
    assert r.status_code == 200


# --- sessions --------------------------------------------------------------------------


async def test_protected_routes_need_a_valid_bearer_token(client: AsyncClient) -> None:
    for headers in ({}, {"authorization": "Basic abc"}, {"authorization": "Bearer "}, bearer("not-a-real-token")):
        r = await client.get("/v1/me", headers=headers)
        assert r.status_code == 401
        assert r.json()["code"] == "unauthenticated"
        assert r.headers["www-authenticate"].startswith("Bearer")


async def test_logout_revokes_only_this_session(client: AsyncClient, jobs: JobRunner) -> None:
    first = (await signup(client, jobs, "member@example.com"))["token"]
    second = (await client.post("/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})).json()[
        "token"
    ]
    assert (await client.post("/v1/auth/logout", headers=bearer(first))).status_code == 204
    assert (await client.get("/v1/me", headers=bearer(first))).status_code == 401
    assert (await client.post("/v1/auth/logout", headers=bearer(first))).status_code == 401
    assert (await client.get("/v1/me", headers=bearer(second))).status_code == 200


async def test_logout_all_revokes_every_session(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    tokens = [(await signup(client, jobs, "member@example.com"))["token"]]
    for _ in range(2):
        r = await client.post("/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})
        tokens.append(r.json()["token"])
    assert (await client.post("/v1/auth/logout-all", headers=bearer(tokens[1]))).status_code == 204
    for token in tokens:
        assert (await client.get("/v1/me", headers=bearer(token))).status_code == 401
    async with db() as s:
        assert (
            await s.execute(select(func.count()).select_from(Session).where(Session.revoked_at.is_(None)))
        ).scalar_one() == 0
        actions = (await s.execute(select(AuditLog.action))).scalars().all()
    assert "auth.logout_all" in actions


async def test_sessions_expire_and_slide(client: AsyncClient, jobs: JobRunner, clock: FrozenClock) -> None:
    token = (await signup(client, jobs, "member@example.com"))["token"]
    clock.advance(days=20)
    assert (await client.get("/v1/me", headers=bearer(token))).status_code == 200  # slides to day 50
    clock.advance(days=20)
    assert (await client.get("/v1/me", headers=bearer(token))).status_code == 200  # day 40: still valid
    clock.advance(days=31)
    assert (await client.get("/v1/me", headers=bearer(token))).status_code == 401  # idle for 31 days


async def test_a_suspended_members_sessions_stop_working(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    token = (await signup(client, jobs, "member@example.com"))["token"]
    await set_user(db, "member@example.com", status=UserStatus.suspended)
    assert (await client.get("/v1/me", headers=bearer(token))).status_code == 401


# --- password reset ----------------------------------------------------------------------


async def test_reset_request_looks_identical_for_known_and_unknown(client: AsyncClient, jobs: JobRunner) -> None:
    await signup(client, jobs, "member@example.com")
    jobs.codes.clear()
    known = await client.post("/v1/auth/password-reset/request", json={"email": "member@example.com"})
    unknown = await client.post("/v1/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert without_request_id(known) == without_request_id(unknown)
    assert known.status_code == 202
    await jobs.run()
    assert len(jobs.codes) == 1
    assert "reset" in jobs.mail_to("member@example.com")[-1].subject


async def test_reset_sets_the_password_and_signs_out_everywhere(client: AsyncClient, jobs: JobRunner) -> None:
    token = (await signup(client, jobs, "member@example.com"))["token"]
    await client.post("/v1/auth/password-reset/request", json={"email": "member@example.com"})
    await jobs.run()
    body = {"email": "member@example.com", "code": jobs.last_code, "new_password": OTHER_PASSWORD}
    assert (await client.post("/v1/auth/password-reset/confirm", json=body)).status_code == 204
    assert (await client.get("/v1/me", headers=bearer(token))).status_code == 401
    assert (
        await client.post("/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})
    ).status_code == 401
    assert (
        await client.post("/v1/auth/login", json={"email": "member@example.com", "password": OTHER_PASSWORD})
    ).status_code == 200
    await jobs.run()
    assert jobs.mail_to("member@example.com")[-1].subject.endswith("password was changed")
    assert (await client.post("/v1/auth/password-reset/confirm", json=body)).status_code == 400  # single use


async def test_reset_rejects_wrong_codes_and_weak_passwords(client: AsyncClient, jobs: JobRunner) -> None:
    await signup(client, jobs, "member@example.com")
    await client.post("/v1/auth/password-reset/request", json={"email": "member@example.com"})
    await jobs.run()
    code = jobs.last_code
    weak = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"email": "member@example.com", "code": code, "new_password": "123456789012345"},
    )
    assert weak.status_code == 422
    assert weak.json()["problems"] == ["breached"]
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    r = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"email": "member@example.com", "code": wrong, "new_password": OTHER_PASSWORD},
    )
    assert r.status_code == 400


async def test_pending_accounts_get_no_reset_code(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    await register(client, app.state.settings, clock, "pending@example.com")
    await jobs.run()
    jobs.codes.clear()
    await client.post("/v1/auth/password-reset/request", json={"email": "pending@example.com"})
    await jobs.run()
    assert jobs.codes == []


async def test_login_is_rate_limited_per_ip_across_addresses(client: AsyncClient) -> None:
    for i in range(30):
        r = await client.post("/v1/auth/login", json={"email": f"nobody{i}@example.com", "password": OTHER_PASSWORD})
        assert r.status_code == 401
    r = await client.post("/v1/auth/login", json={"email": "nobody-else@example.com", "password": OTHER_PASSWORD})
    assert r.status_code == 429


async def test_register_is_rate_limited_per_ip_across_addresses(
    app: FastAPI, client: AsyncClient, clock: FrozenClock
) -> None:
    for i in range(10):
        assert (await register(client, app.state.settings, clock, f"new{i}@example.com")).status_code == 202
    r = await register(client, app.state.settings, clock, "one-more@example.com")
    assert r.status_code == 429
