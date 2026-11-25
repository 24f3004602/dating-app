"""/v1/me/photo-check and /v1/admin/photo-checks: the blue tick (stage 29b, D164)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Form, Query, Request, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.moderation.deps import StaffSession
from app.modules.photochecks import service
from app.modules.photochecks.schemas import CheckDecisionIn, CheckDecisionOut, PendingCheckOut, PhotoCheckOut
from app.modules.profiles.schemas import PhotoUploadForm
from app.openapi import problems
from app.providers.storage import ObjectStorage

router = APIRouter(prefix="/v1", tags=["photo checks"], responses=problems(401, 422))
admin_router = APIRouter(prefix="/v1/admin", tags=["admin"], responses=problems(401, 403, 422))
Limit = Annotated[int, Query(ge=1, le=100)]


def _storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


@router.get("/me/photo-check", summary="The blue tick: where my photo check stands")
async def mine(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> PhotoCheckOut:
    return await service.my_check(db, auth.user.id, ctx.clock())


@router.post(
    "/me/photo-check/gesture",
    status_code=status.HTTP_201_CREATED,
    responses=problems(409, 429),
    summary="The gesture to make in the selfie: the same one for 15 minutes",
)
async def gesture(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> PhotoCheckOut:
    await ctx.limiter.hit(service.GESTURE_LIMIT, str(auth.user.id))
    return await service.give_gesture(db, auth.user.id, ctx.clock())


@router.post(
    "/me/photo-check/selfie",
    status_code=status.HTTP_201_CREATED,
    responses=problems(409, 413, 429),
    summary="Send the selfie making the gesture (JPEG, PNG or WebP; at most 10 MB)",
)
async def selfie(
    request: Request, form: Annotated[PhotoUploadForm, Form()], auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> PhotoCheckOut:
    await ctx.limiter.hit(service.SELFIE_LIMIT, str(auth.user.id))
    data = await form.file.read(ctx.settings.photo_max_bytes + 1)
    return await service.send_selfie(db, ctx.settings, _storage(request), auth.user.id, data=data, now=ctx.clock())


@admin_router.get(
    "/photo-checks/pending", summary="Selfies waiting for review, oldest first, beside each member's photos (audited)"
)
async def pending(
    request: Request, staff: StaffSession, ctx: AuthCtx, db: DbSession, limit: Limit = 50
) -> list[PendingCheckOut]:
    return await service.pending_checks(db, _storage(request), staff.user, limit, now=ctx.clock())


@admin_router.post(
    "/photo-checks/{check_id}/decision",
    status_code=status.HTTP_201_CREATED,
    responses=problems(404, 409),
    summary="Approve (the blue tick) or reject a photo check; the selfie is deleted either way",
)
async def decide(
    check_id: uuid.UUID, body: CheckDecisionIn, staff: StaffSession, ctx: AuthCtx, db: DbSession
) -> CheckDecisionOut:
    return await service.decide(db, ctx.jobs, staff.user, check_id, body, now=ctx.clock())
