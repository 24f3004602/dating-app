"""The web app's session cookie (D152).

The member app on the web keeps its session in an HttpOnly cookie, so it stays signed in across
reloads and visits while no script on the page can read the token (D058 kept it in memory only,
so every reload meant signing in again). The browser asks for it per request with
`X-Session-Cookie: persistent` (kept until the session expires) or `browser` (gone when the
browser closes: "Keep me signed in" off). The phone app never sends the header and keeps its
bearer token in the keystore; staff sessions never use this cookie.

`__Host-` pins the cookie to the API's own host, over HTTPS, at path `/`. `SameSite=Strict` keeps
it out of every cross-site request, and a request that changes something with it must also come
from one of the app's origins (`CORS_ORIGINS`), so a same-site page such as the website can't use
it either.
"""

from __future__ import annotations

import enum
from datetime import datetime

from fastapi import Response

from app.modules.auth.schemas import SessionOut

MEMBER_COOKIE = "__Host-session"
TRANSPORT_HEADER = "X-Session-Cookie"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class CookieMode(enum.StrEnum):
    persistent = "persistent"  # until the session expires
    browser = "browser"  # until the browser closes


def deliver(out: SessionOut, response: Response, mode: CookieMode | None, now: datetime) -> SessionOut:
    """The session as the client asked for it: the bearer token in the body (the phone app, and
    any caller without the header), or the cookie with no token in the body (the web app)."""
    if mode is None or out.token is None:
        return out
    max_age = max(int((out.expires_at - now).total_seconds()), 0) if mode is CookieMode.persistent else None
    response.set_cookie(
        MEMBER_COOKIE, out.token, max_age=max_age, path="/", secure=True, httponly=True, samesite="strict"
    )
    return out.model_copy(update={"token": None})


def clear(response: Response) -> None:
    response.delete_cookie(MEMBER_COOKIE, path="/", secure=True, httponly=True, samesite="strict")


def _cleared() -> str:
    response = Response()
    clear(response)
    return response.headers["set-cookie"]


# The same deletion as a header value, for error responses (they carry headers only).
CLEARED = _cleared()
