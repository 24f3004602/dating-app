"""FastAPI dependencies: auth context, client IP, the current session."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.auth import service
from app.modules.auth.models import Session

DbSession = Annotated[AsyncSession, Depends(get_session)]


def auth_context(request: Request) -> service.AuthContext:
    ctx: service.AuthContext = request.app.state.auth
    return ctx


AuthCtx = Annotated[service.AuthContext, Depends(auth_context)]


def client_ip(request: Request) -> str:
    # Behind a proxy this must come from a trusted forwarded header (stage 17).
    return request.client.host if request.client else "unknown"


ClientIp = Annotated[str, Depends(client_ip)]


@dataclass(frozen=True)
class Authenticated:
    session: Session
    user: User


def _unauthenticated(error: str | None = None) -> ApiError:
    challenge = f'Bearer error="{error}"' if error else "Bearer"
    return ApiError(401, "unauthenticated", "Sign in to continue.", headers={"WWW-Authenticate": challenge})


async def current_session(request: Request, ctx: AuthCtx, db: DbSession) -> Authenticated:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthenticated()
    found = await service.authenticate(db, ctx.settings, token.strip(), ctx.clock())
    if found is None:
        raise _unauthenticated("invalid_token")
    return Authenticated(session=found[0], user=found[1])


CurrentSession = Annotated[Authenticated, Depends(current_session)]
