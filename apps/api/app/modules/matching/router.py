"""/v1/interactions, /v1/likes/received, /v1/matches."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.matching import service
from app.modules.matching.schemas import InteractionIn, InteractionOut, LikeReceivedOut, MatchOut
from app.modules.notifications import service as notify
from app.openapi import problems
from app.providers.storage import ObjectStorage
from app.realtime import RealtimeHub

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
    if out.match is not None:
        hub: RealtimeHub = request.app.state.realtime
        await hub.publish([auth.user.id, body.target_id], {"type": "match.created", "match_id": str(out.match.id)})
    if out.match is not None or body.kind == "like":
        # The other person hears about it (a pass is never announced).
        await notify.request_push(
            db, ctx.jobs, request.app.state.redis, ctx.settings.rate_limit_prefix,
            user_id=body.target_id, kind=notify.Kind.match if out.match is not None else notify.Kind.like,
        )  # fmt: skip
    return out


@router.get("/likes/received", summary="People who liked me and are waiting for my decision")
async def likes_received(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> list[LikeReceivedOut]:
    return await service.likes_received(db, ctx.settings, _storage(request), auth.user.id, ctx.clock())


@router.get("/matches", summary="My open matches, most recent activity first")
async def matches(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> list[MatchOut]:
    return await service.my_matches(db, ctx.settings, _storage(request), auth.user.id, ctx.clock())


@router.get("/matches/{match_id}", responses=problems(404), summary="One of my open matches")
async def match(match_id: uuid.UUID, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> MatchOut:
    found = await service.visible_match(db, auth.user.id, match_id)
    return await service.match_out(db, ctx.settings, _storage(request), found, me=auth.user.id, now=ctx.clock())
