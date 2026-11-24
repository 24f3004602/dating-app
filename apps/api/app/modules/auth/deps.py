"""FastAPI dependencies: auth context, client IP, the current session."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.auth import cookies, service
from app.modules.auth.models import Session, SessionClient

DbSession = Annotated[AsyncSession, Depends(get_session)]


def auth_context(request: Request) -> service.AuthContext:
    ctx: service.AuthContext = request.app.state.auth
    return ctx


AuthCtx = Annotated[service.AuthContext, Depends(auth_context)]


def client_ip(request: Request) -> str:
    # Uvicorn has already applied X-Forwarded-For if, and only if, it came
    # from a trusted proxy (TRUSTED_PROXIES; cli.server_config).
    return request.client.host if request.client else "unknown"


ClientIp = Annotated[str, Depends(client_ip)]


@dataclass(frozen=True)
class Authenticated:
    session: Session
    user: User


def _unauthenticated(error: str | None = None, *, clear_cookie: bool = False) -> ApiError:
    challenge = f'Bearer error="{error}"' if error else "Bearer"
    headers = {"WWW-Authenticate": challenge}
    if clear_cookie:
        headers["Set-Cookie"] = cookies.CLEARED  # a dead session's cookie goes too
    return ApiError(401, "unauthenticated", "Sign in to continue.", headers=headers)


async def _session_of(
    request: Request, ctx: service.AuthContext, db: AsyncSession, client: SessionClient
) -> Authenticated:
    """The bearer token (the phone app, the console's server), or for a member the web app's
    cookie (D152). With the cookie, anything that changes something must also come from one of
    the app's own origins: SameSite keeps other sites out, this keeps out same-site pages."""
    header = request.headers.get("authorization", "")
    scheme, _, bearer = header.partition(" ")
    kept = request.cookies.get(cookies.MEMBER_COOKIE) if client is SessionClient.mobile else None
    if scheme.lower() == "bearer" and bearer.strip():
        token, via_cookie = bearer.strip(), False
    elif kept:
        from_app = request.headers.get("origin") in ctx.settings.cors_origins
        if request.method not in cookies.SAFE_METHODS and not from_app:
            raise ApiError(403, "origin_refused", "This request didn't come from the app.")
        token, via_cookie = kept, True
    else:
        raise _unauthenticated()
    found = await service.authenticate(db, ctx.settings, token, ctx.clock(), client)
    if found is None:
        raise _unauthenticated("invalid_token", clear_cookie=via_cookie)
    return Authenticated(session=found[0], user=found[1])


async def current_session(request: Request, ctx: AuthCtx, db: DbSession) -> Authenticated:
    """A member session (the app). Staff sessions are refused here."""
    return await _session_of(request, ctx, db, SessionClient.mobile)


async def current_staff_session(request: Request, ctx: AuthCtx, db: DbSession) -> Authenticated:
    """A staff session: opened only after two-factor sign-in (D090)."""
    return await _session_of(request, ctx, db, SessionClient.web_admin)


CurrentSession = Annotated[Authenticated, Depends(current_session)]
CurrentStaffSession = Annotated[Authenticated, Depends(current_staff_session)]
