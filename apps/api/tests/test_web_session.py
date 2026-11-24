"""WEB-SESS-1..8 (D152): the web app's session lives in an HttpOnly cookie, so it survives a
reload while no script can read it. The phone app's bearer tokens are unchanged."""

from __future__ import annotations

import dataclasses
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.modules.auth.cookies import MEMBER_COOKIE
from tests.members import make_member
from tests.support import PASSWORD, FrozenClock, JobRunner, bearer, consents, register, signup
from tests.test_google import FakeGoogleServer, google, token  # noqa: F401 - google is a fixture

APP = "https://app.example.test"  # the web app's origin (CORS_ORIGINS)
WEBSITE = "https://example.test"  # same-site, but not the app
PERSISTENT = {"X-Session-Cookie": "persistent", "origin": APP}
BROWSER = {"X-Session-Cookie": "browser", "origin": APP}


@pytest.fixture
def web(app: FastAPI) -> FastAPI:
    settings = app.state.auth.settings.model_copy(update={"cors_origins": [APP]})
    app.state.auth = dataclasses.replace(app.state.auth, settings=settings)
    return app


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-24T09:00:00+00:00")
    return clock.now


def set_cookie(r: httpx.Response) -> str:
    [header] = [h for h in r.headers.get_list("set-cookie") if h.startswith(f"{MEMBER_COOKIE}=")]
    return header


def cookie_of(r: httpx.Response) -> dict[str, str]:
    value = set_cookie(r).split(";", 1)[0].split("=", 1)[1]
    return {"cookie": f"{MEMBER_COOKIE}={value}"}


def attributes(header: str) -> set[str]:
    return {part.strip().lower() for part in header.split(";")[1:]}


async def login(client: AsyncClient, email: str, headers: dict[str, str] | None = None) -> httpx.Response:
    client.cookies.clear()  # every test hands cookies over itself
    return await client.post("/v1/auth/login", json={"email": email, "password": PASSWORD}, headers=headers or {})


async def test_signing_in_on_the_web_puts_the_session_in_a_cookie_no_script_can_read(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-1"""
    await signup(client, jobs, "asha@example.com")
    r = await login(client, "asha@example.com", PERSISTENT)
    assert r.status_code == 200, r.text
    assert r.json()["token"] is None  # nothing for a script to read
    assert datetime.fromisoformat(r.json()["expires_at"]) == now + timedelta(days=30)
    flags = attributes(set_cookie(r))
    assert {"httponly", "secure", "samesite=strict", "path=/", f"max-age={30 * 24 * 3600}"} <= flags
    assert not any(f.startswith("domain=") for f in flags)  # __Host-: this host only
    me = await client.get("/v1/me", headers=cookie_of(r))
    assert (me.status_code, me.json()["email"]) == (200, "asha@example.com")

    # Without the header nothing changes: the token in the body, no cookie (the phone app).
    plain = await login(client, "asha@example.com")
    assert plain.json()["token"]
    assert not plain.headers.get_list("set-cookie")


async def test_keep_me_signed_in_off_lasts_until_the_browser_closes(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-2"""
    await signup(client, jobs, "ravi@example.com")
    r = await login(client, "ravi@example.com", BROWSER)
    flags = attributes(set_cookie(r))
    assert {"httponly", "secure", "samesite=strict", "path=/"} <= flags
    assert not any(f.startswith(("max-age", "expires")) for f in flags)
    bad = await login(client, "ravi@example.com", {"X-Session-Cookie": "forever"})
    assert bad.status_code == 422


async def test_changes_with_the_cookie_must_come_from_the_app(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-3: SameSite keeps other sites out; the origin check keeps out same-site pages."""
    await signup(client, jobs, "meera@example.com")
    jar = cookie_of(await login(client, "meera@example.com", PERSISTENT))
    for origin in (None, WEBSITE, "https://evil.example"):
        headers = jar | ({"origin": origin} if origin else {})
        r = await client.post("/v1/auth/logout", headers=headers)
        assert (r.status_code, r.json()["code"]) == (403, "origin_refused"), origin
    assert (await client.get("/v1/me", headers=jar)).status_code == 200  # reading needs no origin
    out = await client.post("/v1/auth/logout", headers=jar | {"origin": APP})
    assert out.status_code == 204
    assert "max-age=0" in attributes(set_cookie(out))  # the cookie goes with the session
    gone = await client.get("/v1/me", headers=jar)
    assert gone.status_code == 401
    assert "max-age=0" in attributes(set_cookie(gone))  # a dead session's cookie is cleared too


async def test_a_made_up_cookie_is_refused_and_cleared(web: FastAPI, client: AsyncClient) -> None:
    """WEB-SESS-4"""
    r = await client.get("/v1/me", headers={"cookie": f"{MEMBER_COOKIE}=not-a-real-session"})
    assert r.status_code == 401
    assert "max-age=0" in attributes(set_cookie(r))
    bare = await client.get("/v1/me")
    assert bare.status_code == 401
    assert not bare.headers.get_list("set-cookie")  # nothing to clear


async def test_a_bearer_token_wins_and_staff_routes_ignore_the_cookie(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-5"""
    await signup(client, jobs, "kiran@example.com")
    jar = cookie_of(await login(client, "kiran@example.com", PERSISTENT))
    other = await signup(client, jobs, "dev@example.com")
    me = await client.get("/v1/me", headers=jar | bearer(other["token"]))
    assert me.json()["email"] == "dev@example.com"
    admin = await make_member(jobs.db, web.state.storage, now, role="admin", name="Admin", session_client="web_admin")
    assert admin.headers  # a real staff session, by bearer
    assert (await client.get("/v1/admin/reports", headers=admin.headers)).status_code == 200
    staff = await client.get("/v1/admin/reports", headers=jar | {"origin": APP})
    assert staff.status_code == 401  # a member's cookie never opens the console
    # Nor does a staff token in that cookie: staff sessions travel by bearer only.
    staff_token = admin.headers["authorization"].removeprefix("Bearer ")
    smuggled = await client.get(
        "/v1/admin/reports", headers={"cookie": f"{MEMBER_COOKIE}={staff_token}", "origin": APP}
    )
    assert smuggled.status_code == 401


async def test_sign_up_keep_my_account_and_deletion_from_the_web(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-6: every way in sets the cookie; deleting ends it."""
    r = await register(client, jobs.settings, jobs.clock, "neha@example.com", PASSWORD)
    assert r.status_code == 202
    await jobs.run()
    body = {"email": "neha@example.com", "code": jobs.last_code, "password": PASSWORD}
    verified = await client.post("/v1/auth/verify-email", json=body, headers=PERSISTENT)
    assert (verified.status_code, verified.json()["token"]) == (201, None)
    jar = cookie_of(verified)
    deleted = await client.post("/v1/me/deletion", json={"password": PASSWORD}, headers=jar | {"origin": APP})
    assert deleted.status_code == 202, deleted.text
    assert "max-age=0" in attributes(set_cookie(deleted))
    client.cookies.clear()
    kept = await client.post(
        "/v1/auth/restore", json={"email": "neha@example.com", "password": PASSWORD}, headers=PERSISTENT
    )
    assert (kept.status_code, kept.json()["token"]) == (200, None)
    assert (await client.get("/v1/me", headers=cookie_of(kept))).status_code == 200


async def test_google_on_the_web_ends_in_the_cookie(
    web: FastAPI,
    client: AsyncClient,
    google: FakeGoogleServer,  # noqa: F811 - the fixture
) -> None:
    """WEB-SESS-7: Google's finish step and a later Google sign-in, as the web app makes them."""
    first = await client.post(
        "/v1/auth/google", json={"id_token": token(datetime.now().astimezone())}, headers=PERSISTENT
    )
    assert first.json()["session"] is None  # someone new: a ticket, no cookie yet
    assert not first.headers.get_list("set-cookie")
    done = await client.post(
        "/v1/auth/google/complete",
        json={
            "ticket": first.json()["ticket"],
            "birthdate": "1996-03-01",
            "consents": consents(web.state.auth.settings),
        },
        headers=PERSISTENT,
    )
    assert (done.status_code, done.json()["token"]) == (201, None)
    assert (await client.get("/v1/me", headers=cookie_of(done))).status_code == 200
    again = await client.post("/v1/auth/google", json={"id_token": token(datetime.now().astimezone())}, headers=BROWSER)
    assert again.json()["session"]["token"] is None
    assert (await client.get("/v1/me", headers=cookie_of(again))).status_code == 200


async def test_the_realtime_ticket_comes_with_the_cookie(
    web: FastAPI, client: AsyncClient, jobs: JobRunner, now: datetime
) -> None:
    """WEB-SESS-8: the live connection's ticket, as the web app asks for it."""
    await signup(client, jobs, "zoya@example.com")
    jar = cookie_of(await login(client, "zoya@example.com", PERSISTENT))
    r = await client.post("/v1/realtime/ticket", headers=jar | {"origin": APP})
    assert r.status_code == 201, r.text
    assert r.json()["ticket"]
