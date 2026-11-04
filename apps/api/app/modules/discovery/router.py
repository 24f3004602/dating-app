"""/v1/discovery/today and /v1/me/preferences."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.discovery import service
from app.modules.discovery.schemas import PreferencesIn, PreferencesOut, TodayOut
from app.openapi import problems
from app.providers.storage import ObjectStorage

router = APIRouter(prefix="/v1", tags=["discovery"], responses=problems(401, 422))


@router.get("/me/preferences", summary="My discovery preferences (defaults if never set)")
async def get_preferences(auth: CurrentSession, db: DbSession) -> PreferencesOut:
    return await service.get_preferences(db, auth.user.id)


@router.put("/me/preferences", summary="Set my preferences; they apply from the next daily set")
async def put_preferences(body: PreferencesIn, auth: CurrentSession, db: DbSession) -> PreferencesOut:
    return await service.put_preferences(db, auth.user.id, body)


@router.get(
    "/discovery/today",
    responses=problems(409, 429),
    summary="Today's finite set: built once a day, filtered before ranking, distance as a bucket only",
)
async def today(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> TodayOut:
    await ctx.limiter.hit(service.TODAY_LIMIT, str(auth.user.id))
    storage: ObjectStorage = request.app.state.storage
    return await service.today(db, ctx.settings, storage, auth.user, ctx.clock())
