"""/v1/me/push-device, /v1/me/notifications, /v1/me/notices (stage 16, D093)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.notifications import service
from app.modules.notifications.schemas import NoticeOut, PrefsBody, PushDeviceIn
from app.openapi import problems

router = APIRouter(prefix="/v1/me", tags=["notifications"], responses=problems(401, 422))


@router.put(
    "/push-device",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problems(429),
    summary="Register this phone for pushes (tied to this session; signing out stops them)",
)
async def register_device(body: PushDeviceIn, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await ctx.limiter.hit(service.DEVICE_LIMIT, str(auth.user.id))
    await service.register_device(db, auth.user.id, auth.session.id, body, ctx.clock())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/push-device", status_code=status.HTTP_204_NO_CONTENT, summary="Stop pushes to this phone")
async def remove_device(auth: CurrentSession, db: DbSession) -> Response:
    await service.remove_device(db, auth.session.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/notifications", summary="Which pushes I get (team notices always come)")
async def get_prefs(auth: CurrentSession, db: DbSession) -> PrefsBody:
    return await service.get_prefs(db, auth.user.id)


@router.put("/notifications", summary="Choose which pushes I get")
async def set_prefs(body: PrefsBody, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> PrefsBody:
    return await service.set_prefs(db, auth.user.id, body, ctx.clock())


@router.get("/notices", summary="Notices from the team, newest first")
async def notices(auth: CurrentSession, db: DbSession) -> list[NoticeOut]:
    return await service.notices(db, auth.user.id)


@router.post(
    "/notices/{notice_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problems(404),
    summary="Mark a notice read",
)
async def mark_read(notice_id: uuid.UUID, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.mark_notice_read(db, auth.user.id, notice_id, ctx.clock())
    return Response(status_code=status.HTTP_204_NO_CONTENT)
