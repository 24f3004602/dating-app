"""/v1/me/profile, /v1/me/privacy, /v1/areas, /v1/prompts, /v1/profiles/{id}."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request

from app.errors import ApiError
from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.discovery.service import PROFILE_VIEW_LIMIT
from app.modules.profiles import service
from app.modules.profiles.catalogue import PROMPTS
from app.modules.profiles.schemas import AreaOut, MyProfileOut, PrivacyIn, ProfileIn, PromptOut, PublicProfileOut
from app.openapi import problems
from app.policies.access import can_view_profile
from app.providers.storage import ObjectStorage

router = APIRouter(prefix="/v1", tags=["profiles"], responses=problems(401, 422))


def _storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


async def _mine(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> MyProfileOut:
    out = await service.my_profile(db, ctx.settings, _storage(request), auth.user, ctx.clock())
    if out is None:
        raise ApiError(404, "profile_not_found", "You haven't created your profile yet.")
    return out


@router.get("/areas", summary="Areas a member can pick (names only, never coordinates)")
async def areas(auth: CurrentSession, db: DbSession) -> list[AreaOut]:
    return [AreaOut(id=a.id, city=a.city, name=a.name) for a in await service.list_areas(db)]


@router.get("/prompts", summary="The prompt catalogue")
async def prompts(auth: CurrentSession) -> list[PromptOut]:
    return [PromptOut(key=k, text=v) for k, v in PROMPTS.items()]


@router.get("/me/profile", responses=problems(404), summary="My profile, including pending photos")
async def get_my_profile(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> MyProfileOut:
    return await _mine(request, auth, ctx, db)


@router.put("/me/profile", responses=problems(429), summary="Create or replace my profile")
async def put_my_profile(
    body: ProfileIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> MyProfileOut:
    await service.upsert_profile(db, auth.user.id, body, ctx.clock())
    return await _mine(request, auth, ctx, db)


@router.patch("/me/privacy", responses=problems(409), summary="Visibility and discovery pause")
async def patch_privacy(
    body: PrivacyIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> MyProfileOut:
    await service.update_privacy(db, auth.user.id, body)
    return await _mine(request, auth, ctx, db)


@router.get(
    "/profiles/{user_id}",
    responses=problems(404),
    summary="Another member's profile, only where the access policy allows (otherwise 404)",
)
async def get_profile(
    user_id: uuid.UUID, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> PublicProfileOut:
    if auth.user.id != user_id:
        await ctx.limiter.hit(PROFILE_VIEW_LIMIT, str(auth.user.id))
    if not await can_view_profile(db, auth.user.id, user_id, settings=ctx.settings, now=ctx.clock()):
        raise ApiError(404, "not_found")
    out = await service.public_profile(db, ctx.settings, _storage(request), user_id, ctx.clock())
    if out is None:
        raise ApiError(404, "not_found")
    return out
