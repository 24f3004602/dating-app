"""/v1/interactions, /v1/likes/received, /v1/matches."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.matching import service
from app.modules.matching.schemas import InteractionIn, InteractionOut, LikeReceivedOut, MatchOut
from app.openapi import problems
from app.providers.storage import ObjectStorage

router = APIRouter(prefix="/v1", tags=["matching"], responses=problems(401, 422))


def _storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


@router.post(
    "/interactions",
    status_code=status.HTTP_201_CREATED,
    responses={
        **problems(404, 409, 429),
        200: {"model": InteractionOut, "description": "The same decision again: the original result"},
    },
    summary="Like or pass (no undo). A mutual like creates exactly one match",
)
async def decide(
    body: InteractionIn, *, request: Request, response: Response, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> InteractionOut:
    await ctx.limiter.hit(service.DECIDE_LIMIT, str(auth.user.id))
    out, created = await service.decide(db, ctx.settings, _storage(request), auth.user, data=body, now=ctx.clock())
    if not created:
        response.status_code = status.HTTP_200_OK
    return out


@router.get("/likes/received", summary="People who liked me and are waiting for my decision")
async def likes_received(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> list[LikeReceivedOut]:
    return await service.likes_received(db, ctx.settings, _storage(request), auth.user.id, ctx.clock())


@router.get("/matches", summary="My open matches")
async def matches(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> list[MatchOut]:
    return await service.my_matches(db, ctx.settings, _storage(request), auth.user.id, ctx.clock())
