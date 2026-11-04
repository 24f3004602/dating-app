"""/v1/me: the signed-in member's own account."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.modules.auth.deps import AuthCtx, CurrentSession
from app.modules.auth.schemas import MeOut
from app.modules.auth.service import me_out
from app.openapi import problems
from app.providers.identity import IdentityVerifier

router = APIRouter(prefix="/v1", tags=["account"], responses=problems(401))


@router.get("/me", summary="My account, with honest verification labels")
async def me(auth: CurrentSession, ctx: AuthCtx, request: Request) -> MeOut:
    identity: IdentityVerifier = request.app.state.identity
    return me_out(auth.user, ctx.settings, ctx.clock(), await identity.status(auth.user.id))
