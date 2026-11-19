"""Sign in with Google (D134): verify Google's ID tokens, and exchange the web app's code.

- **ID tokens** (OpenID Connect) are checked here, never trusted from the client: the
  signature against Google's published keys (fetched from `JWKS_URL`, kept for the time
  Google's Cache-Control allows, fetched again once for an unknown key), RS256 only,
  the audience is our Web client ID (the Android app asks for tokens for it too), the
  issuer is Google's, the token hasn't expired (a minute's leeway), and the subject and
  email are present. Docs read 2026-11-19: developers.google.com/identity/openid-connect.
- **The web app's code** (authorization code with PKCE) is exchanged here, with the
  client secret that never leaves this server, for an ID token checked the same way.

Nothing is kept from Google but the subject (a stable account ID) and the email: no
access token, no refresh token, no profile photo.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.config import Settings

JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - an endpoint, not a credential
AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
ISSUERS = ("accounts.google.com", "https://accounts.google.com")
GMAIL = ("gmail.com", "googlemail.com")
LEEWAY_S = 60
KEYS_TTL_DEFAULT_S = 3600


class GoogleUnavailableError(RuntimeError):
    """Google sign-in isn't set up here, or Google can't be reached."""


class GoogleTokenError(ValueError):
    """The token or code isn't a valid sign-in for this app."""


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str  # lower-case
    email_verified: bool
    name: str | None
    # Google is the address's own provider (Gmail, or the Workspace domain in `hd`), so it
    # vouches the person holds it now. Other verified addresses were verified once, at some
    # point; Google's guidance is not to treat them as proof on their own.
    email_authoritative: bool = False


class GoogleSignIn(Protocol):
    client_id: str | None

    async def verify_id_token(self, token: str, *, max_age_s: int | None = None) -> GoogleIdentity: ...
    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> GoogleIdentity: ...


class NoGoogle:
    client_id: str | None = None

    async def verify_id_token(self, token: str, *, max_age_s: int | None = None) -> GoogleIdentity:
        raise GoogleUnavailableError("Google sign-in is not set up")

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> GoogleIdentity:
        raise GoogleUnavailableError("Google sign-in is not set up")


_MAX_AGE = re.compile(r"max-age=(\d+)")


class GoogleOAuth:
    def __init__(self, client_id: str, client_secret: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.client_id: str | None = client_id
        self._secret = client_secret
        self._http = httpx.AsyncClient(timeout=10.0, transport=transport)
        self._keys: dict[str, Any] = {}
        self._keys_until = 0.0

    async def _fetch_keys(self) -> None:
        try:
            res = await self._http.get(JWKS_URL)
        except httpx.HTTPError as exc:
            raise GoogleUnavailableError("Google's keys could not be fetched") from exc
        if res.status_code != 200:
            raise GoogleUnavailableError(f"Google's keys answered {res.status_code}")
        try:
            keys = {k["kid"]: RSAAlgorithm.from_jwk(json.dumps(k)) for k in res.json()["keys"] if k.get("kty") == "RSA"}
        except (ValueError, KeyError, TypeError) as exc:
            raise GoogleUnavailableError("Google's keys were not readable") from exc
        found = _MAX_AGE.search(res.headers.get("cache-control", ""))
        self._keys = keys
        self._keys_until = time.monotonic() + (int(found.group(1)) if found else KEYS_TTL_DEFAULT_S)

    async def _key(self, kid: str) -> Any:
        if time.monotonic() >= self._keys_until or kid not in self._keys:
            await self._fetch_keys()  # a key Google rotated in since the last fetch
        key = self._keys.get(kid)
        if key is None:
            raise GoogleTokenError("unknown signing key")
        return key

    async def verify_id_token(self, token: str, *, max_age_s: int | None = None) -> GoogleIdentity:
        """`max_age_s`: Google signed the person in no longer ago than this (a confirmation)."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise GoogleTokenError("not a token") from exc
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise GoogleTokenError("unexpected token header")
        key = await self._key(header["kid"])
        try:
            claims = jwt.decode(
                token, key, algorithms=["RS256"], audience=self.client_id, issuer=ISSUERS, leeway=LEEWAY_S,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )  # fmt: skip
        except jwt.PyJWTError as exc:
            raise GoogleTokenError("invalid token") from exc
        if max_age_s is not None and int(claims["iat"]) < time.time() - max_age_s - LEEWAY_S:
            raise GoogleTokenError("signed in too long ago")
        email = claims.get("email")
        if not isinstance(email, str) or "@" not in email:
            raise GoogleTokenError("no email in the token")
        verified = claims.get("email_verified") in (True, "true")
        email = email.strip().lower()
        domain = email.rpartition("@")[2]
        hd = claims.get("hd")
        authoritative = verified and (domain in GMAIL or (isinstance(hd, str) and hd.lower() == domain))
        name = claims.get("given_name") or claims.get("name")
        return GoogleIdentity(
            subject=str(claims["sub"]), email=email, email_verified=verified,
            name=name.strip()[:60] if isinstance(name, str) and name.strip() else None,
            email_authoritative=authoritative,
        )  # fmt: skip

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> GoogleIdentity:
        try:
            res = await self._http.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self._secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": code_verifier,
                },
            )
        except httpx.HTTPError as exc:
            raise GoogleUnavailableError("Google could not be reached") from exc
        if res.status_code >= 500:
            raise GoogleUnavailableError(f"Google answered {res.status_code}")
        if res.status_code != 200:
            raise GoogleTokenError("the code was not accepted")  # used, expired, or not ours
        try:
            id_token = str(res.json()["id_token"])
        except (ValueError, KeyError, TypeError) as exc:
            raise GoogleTokenError("no ID token in Google's answer") from exc
        return await self.verify_id_token(id_token)

    async def aclose(self) -> None:
        await self._http.aclose()


def create_google(settings: Settings) -> NoGoogle | GoogleOAuth:
    if settings.google_client_id and settings.google_client_secret:
        return GoogleOAuth(settings.google_client_id, settings.google_client_secret.get_secret_value())
    return NoGoogle()
