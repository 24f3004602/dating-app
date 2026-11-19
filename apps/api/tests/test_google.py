"""Sign in with Google (D134): tokens checked on the server against Google's keys (here a
stand-in key set, signed with a test RSA key), linking by verified email, new members
finishing with the age gate and the documents, the same account rules as a password
sign-in, and the web app's code exchange."""

from __future__ import annotations

import dataclasses
import json
from datetime import date, datetime, timedelta
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from httpx import AsyncClient
from jwt.algorithms import RSAAlgorithm
from sqlalchemy import func, select

from app.modules.accounts.models import UNUSABLE_PASSWORD, User, UserIdentity, UserStatus
from app.modules.audit.models import AuditLog
from app.providers.google import JWKS_URL, TOKEN_URL, GoogleOAuth, GoogleTokenError
from tests.chat import Db
from tests.members import Member, make_member
from tests.support import PASSWORD, FrozenClock, consents

CLIENT = "123456789012-testclient.apps.googleusercontent.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
REDIRECT = "https://app.example.in/auth/google"
VERIFIER = "v" * 43


def jwks() -> dict[str, Any]:
    public = json.loads(RSAAlgorithm.to_jwk(KEY.public_key()))
    return {"keys": [public | {"kid": "k1", "alg": "RS256", "use": "sig"}]}


def token(now: datetime, *, sub: str = "g-1001", email: str = "asha@gmail.com", verified: bool = True,
          aud: str = CLIENT, iss: str = "https://accounts.google.com", key: Any = KEY, kid: str = "k1",
          life: timedelta = timedelta(hours=1), hd: str | None = None) -> str:  # fmt: skip
    claims = {"sub": sub, "email": email, "email_verified": verified, "aud": aud, "iss": iss,
              "iat": int(now.timestamp()), "exp": int((now + life).timestamp()), "given_name": "Asha"}  # fmt: skip
    if hd is not None:
        claims["hd"] = hd  # a Google Workspace account's domain
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


class FakeGoogleServer:
    """Google's key set and token endpoint, as httpx sees them."""

    def __init__(self) -> None:
        self.codes: dict[str, str] = {}
        self.jwks_fetches = 0
        self.down = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("down")
        if str(request.url) == JWKS_URL:
            self.jwks_fetches += 1
            return httpx.Response(200, json=jwks(), headers={"cache-control": "public, max-age=3600"})
        if str(request.url) == TOKEN_URL:
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            if form.get("code") not in self.codes or form.get("code_verifier") != VERIFIER:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"id_token": self.codes.pop(form["code"]), "access_token": "x"})
        return httpx.Response(404)


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-19T09:00:00+00:00")
    return clock.now


@pytest.fixture
def google(app: FastAPI) -> FakeGoogleServer:
    server = FakeGoogleServer()
    app.state.google = GoogleOAuth(CLIENT, "test-secret", transport=httpx.MockTransport(server.handler))
    settings = app.state.auth.settings.model_copy(update={"google_redirect_uri": REDIRECT})
    app.state.auth = dataclasses.replace(app.state.auth, settings=settings)
    return server


async def sign_in(client: AsyncClient, body: dict[str, Any]) -> httpx.Response:
    return await client.post("/v1/auth/google", json=body)


async def finish(client: AsyncClient, app: FastAPI, ticket: str, birthdate: str = "1996-03-01") -> httpx.Response:
    return await client.post(
        "/v1/auth/google/complete",
        json={"ticket": ticket, "birthdate": birthdate, "consents": consents(app.state.auth.settings)},
    )


async def count(db: Db, *where: Any, model: Any = User) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())


# --- the token check --------------------------------------------------------------------


async def test_id_tokens_are_checked_on_the_server(now: datetime) -> None:
    """GOOGLE-1: Google's signature, our audience, Google's issuer, unexpired; keys fetched once."""
    server = FakeGoogleServer()
    google = GoogleOAuth(CLIENT, "s", transport=httpx.MockTransport(server.handler))
    # PyJWT reads the real clock: tokens here are made around it.
    real = datetime.now().astimezone()
    who = await google.verify_id_token(token(real))
    assert (who.subject, who.email, who.email_verified, who.name) == ("g-1001", "asha@gmail.com", True, "Asha")
    # Google vouches for Gmail and Workspace addresses now; others were only verified once.
    assert who.email_authoritative
    assert (await google.verify_id_token(token(real, email="a@work.in", hd="work.in"))).email_authoritative
    assert not (await google.verify_id_token(token(real, email="a@work.in"))).email_authoritative
    assert not (await google.verify_id_token(token(real, email="a@work.in", hd="other.in"))).email_authoritative
    assert not (await google.verify_id_token(token(real, verified=False))).email_authoritative
    assert (await google.verify_id_token(token(real, iss="accounts.google.com"))).subject == "g-1001"
    for bad in (
        token(real, aud="999-other.apps.googleusercontent.com"),  # another app's token
        token(real, iss="https://evil.example"),
        token(real - timedelta(hours=3)),  # expired
        token(real, key=OTHER_KEY),  # not Google's signature
        token(real, kid="unknown"),  # a key Google never published
        jwt.encode({"sub": "x", "aud": CLIENT}, "s" * 32, algorithm="HS256", headers={"kid": "k1"}),
        "not.a.token",
    ):
        with pytest.raises(GoogleTokenError):
            await google.verify_id_token(bad)
    assert server.jwks_fetches == 2  # once, then once more for the unknown key


# --- signing in ---------------------------------------------------------------------------


async def test_someone_new_finishes_with_the_age_gate_and_the_documents(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-2: a ticket, then a date of birth (18+) and the documents; no password; email verified."""
    assert (await client.get("/v1/auth/google")).json() == {
        "enabled": True,
        "client_id": CLIENT,
        "redirect_uri": REDIRECT,
    }
    first = (await sign_in(client, {"id_token": token(datetime.now().astimezone())})).json()
    assert first["session"] is None
    assert (first["email"], first["name"]) == ("asha@gmail.com", "Asha")
    young = await finish(client, app, first["ticket"], birthdate=str(date(now.year - 17, 1, 1)))
    assert (young.status_code, young.json()["code"]) == (422, "underage")
    tampered = await finish(client, app, first["ticket"][:-2] + "xx")
    assert (tampered.status_code, tampered.json()["code"]) == (400, "google_ticket_invalid")
    old_documents = {"terms": "old", "privacy": "old"}
    stale = await client.post(
        "/v1/auth/google/complete",
        json={"ticket": first["ticket"], "birthdate": "1996-03-01", "consents": old_documents},
    )
    assert (stale.status_code, stale.json()["code"]) == (422, "consent_required")

    done = await finish(client, app, first["ticket"])
    assert done.status_code == 201, done.text
    me = done.json()["user"]
    assert (me["email"], me["verification"]["email"], me["has_password"], me["status"]) == (
        "asha@gmail.com", "verified", False, "active")  # fmt: skip
    headers = {"authorization": f"Bearer {done.json()['token']}"}
    assert (await client.get("/v1/me", headers=headers)).status_code == 200
    async with db() as s:
        user = (await s.execute(select(User).where(User.email_normalized == "asha@gmail.com"))).scalar_one()
        assert user.password_hash == UNUSABLE_PASSWORD
    assert await count(db, UserIdentity.subject == "g-1001", model=UserIdentity) == 1
    # A password can't open it (none was set).
    nope = await client.post("/v1/auth/login", json={"email": "asha@gmail.com", "password": PASSWORD})
    assert nope.status_code == 401
    # The ticket again (a second tab): the account is there, so it signs in.
    again = await finish(client, app, first["ticket"])
    assert again.status_code == 201
    assert await count(db, User.email_normalized == "asha@gmail.com") == 1

    # Next time, straight in.
    back = (await sign_in(client, {"id_token": token(datetime.now().astimezone())})).json()
    assert back["session"]["user"]["email"] == "asha@gmail.com"
    async with db() as s:
        actions = set((await s.execute(select(AuditLog.action).where(AuditLog.action.like("auth.google%")))).scalars())
    assert actions == {"auth.google_signup", "auth.google_login"}


async def test_an_existing_account_is_linked_by_its_verified_address(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-3: Google vouches for the address, so the account with it is linked; otherwise it isn't."""
    ravi: Member = await make_member(db, app.state.storage, now)
    async with db() as s:
        email = (await s.execute(select(User.email_normalized).where(User.id == ravi.id))).scalar_one()
    domain = email.rpartition("@")[2]
    unverified = await sign_in(
        client, {"id_token": token(datetime.now().astimezone(), sub="g-2", email=email, verified=False)}
    )
    assert (unverified.status_code, unverified.json()["code"]) == (403, "google_email_unverified")
    # Verified once, but Google isn't the address's provider: the password is asked for.
    once = await sign_in(client, {"id_token": token(datetime.now().astimezone(), sub="g-2", email=email)})
    assert (once.status_code, once.json()["code"]) == (409, "google_link_refused")
    assert await count(db, UserIdentity.user_id == ravi.id, model=UserIdentity) == 0

    workspace = token(datetime.now().astimezone(), sub="g-2", email=email, hd=domain)
    linked = (await sign_in(client, {"id_token": workspace})).json()
    assert linked["session"]["user"]["id"] == str(ravi.id)
    assert await count(db, UserIdentity.user_id == ravi.id, model=UserIdentity) == 1
    # The link is by Google's account ID: a changed Google address still signs in.
    moved = (
        await sign_in(client, {"id_token": token(datetime.now().astimezone(), sub="g-2", email="new@gmail.com")})
    ).json()
    assert moved["session"]["user"]["id"] == str(ravi.id)


async def test_an_unfinished_sign_up_gives_way_and_its_password_never_works(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-4: a never-verified sign-up with the address isn't linked; finishing with Google replaces it."""
    pending = await client.post("/v1/auth/register", json={
        "email": "meera@gmail.com", "password": PASSWORD, "birthdate": "1995-01-01",
        "consents": consents(app.state.auth.settings)})  # fmt: skip
    assert pending.status_code == 202
    first = (
        await sign_in(client, {"id_token": token(datetime.now().astimezone(), sub="g-3", email="meera@gmail.com")})
    ).json()
    assert first["session"] is None
    assert (await finish(client, app, first["ticket"])).status_code == 201
    async with db() as s:
        user = (await s.execute(select(User).where(User.email_normalized == "meera@gmail.com"))).scalar_one()
        assert (user.status, user.password_hash) == (UserStatus.active, UNUSABLE_PASSWORD)
    stolen = await client.post("/v1/auth/login", json={"email": "meera@gmail.com", "password": PASSWORD})
    assert stolen.status_code == 401  # whoever typed that password can't get in


async def test_the_same_account_rules_as_a_password_sign_in(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-5: suspended accounts are refused; one waiting to be deleted is kept only when asked."""
    kabir = await make_member(db, app.state.storage, now, status="suspended")
    async with db() as s:
        email = (await s.execute(select(User.email_normalized).where(User.id == kabir.id))).scalar_one()
    suspended_token = token(datetime.now().astimezone(), sub="g-4", email=email, hd="example.com")
    refused = await sign_in(client, {"id_token": suspended_token})
    assert (refused.status_code, refused.json()["code"]) == (403, "account_suspended")

    leaving = await make_member(db, app.state.storage, now, status="deactivated", deletion_requested=True)
    async with db() as s:
        email = (await s.execute(select(User.email_normalized).where(User.id == leaving.id))).scalar_one()
    leaving_token = token(datetime.now().astimezone(), sub="g-5", email=email, hd="example.com")
    asked = await sign_in(client, {"id_token": leaving_token})
    assert (asked.status_code, asked.json()["code"]) == (403, "deletion_scheduled")
    kept = await sign_in(client, {"id_token": leaving_token, "restore": True})
    assert kept.status_code == 200
    assert kept.json()["session"]["user"]["status"] == "active"


async def test_the_web_apps_code_is_exchanged_here(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-6: the code and its PKCE verifier for an ID token; a used or wrong code fails; Google down is 503."""
    google.codes["code-123456"] = token(datetime.now().astimezone(), sub="g-6", email="zoya@gmail.com")
    wrong = await sign_in(client, {"code": "code-123456", "code_verifier": "w" * 43})
    assert (wrong.status_code, wrong.json()["code"]) == (401, "google_invalid")
    ok = (await sign_in(client, {"code": "code-123456", "code_verifier": VERIFIER})).json()
    assert ok["email"] == "zoya@gmail.com"
    assert ok["ticket"]
    used = await sign_in(client, {"code": "code-123456", "code_verifier": VERIFIER})
    assert used.status_code == 401
    both = await sign_in(client, {"id_token": "x" * 30, "code": "code-123456", "code_verifier": VERIFIER})
    assert both.status_code == 422
    google.down = True
    google.codes["code-999999"] = "irrelevant"
    down = await sign_in(client, {"code": "code-999999", "code_verifier": VERIFIER})
    assert (down.status_code, down.json()["code"]) == (503, "google_unavailable")


async def test_an_account_without_a_password_is_deleted_with_google_again(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, google: FakeGoogleServer
) -> None:
    """GOOGLE-8: deletion asks who it is: no password to give, so the same Google account, just now."""
    real = datetime.now().astimezone()
    first = (await sign_in(client, {"id_token": token(real, sub="g-8", email="dev@gmail.com")})).json()
    done = (await finish(client, app, first["ticket"])).json()
    headers = {"authorization": f"Bearer {done['token']}"}

    async def delete(body: dict[str, Any]) -> httpx.Response:
        return await client.post("/v1/me/deletion", json=body, headers=headers)

    no_password = await delete({"password": PASSWORD})
    assert (no_password.status_code, no_password.json()["code"]) == (403, "password_incorrect")
    someone_else = await delete({"google": {"id_token": token(real, sub="g-other", email="x@gmail.com")}})
    assert (someone_else.status_code, someone_else.json()["code"]) == (403, "google_mismatch")
    stale = await delete(
        {"google": {"id_token": token(real - timedelta(minutes=20), sub="g-8", email="dev@gmail.com")}}
    )
    assert (stale.status_code, stale.json()["code"]) == (401, "google_invalid")
    for neither_or_both in ({}, {"password": PASSWORD, "google": {"id_token": token(real, sub="g-8")}}):
        assert (await delete(neither_or_both)).status_code == 422

    ok = await delete({"google": {"id_token": token(real, sub="g-8", email="dev@gmail.com")}})
    assert ok.status_code == 202, ok.text
    async with db() as s:
        user = (await s.execute(select(User).where(User.email_normalized == "dev@gmail.com"))).scalar_one()
        assert user.status is UserStatus.deactivated
        actions = set(
            (await s.execute(select(AuditLog.action).where(AuditLog.action.like("account.deletion%")))).scalars()
        )
    assert actions == {
        "account.deletion_password_failed",
        "account.deletion_google_failed",
        "account.deletion_requested",
    }


async def test_without_google_set_up_nothing_is_offered(app: FastAPI, client: AsyncClient) -> None:
    """GOOGLE-7: the default: the apps hide the button, and the API refuses."""
    assert (await client.get("/v1/auth/google")).json() == {"enabled": False, "client_id": None, "redirect_uri": None}
    r = await sign_in(client, {"id_token": "x" * 40})
    assert (r.status_code, r.json()["code"]) == (503, "google_unavailable")
