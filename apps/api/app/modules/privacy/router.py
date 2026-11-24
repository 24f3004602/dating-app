"""/v1/me/deletion: delete my account (D083)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.modules.auth import cookies
from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.privacy import service
from app.modules.privacy.schemas import DeletionIn, DeletionOut
from app.openapi import problems
from app.realtime import RealtimeHub

router = APIRouter(prefix="/v1", tags=["account"], responses=problems(401, 422, 429))


@router.post(
    "/me/deletion",
    status_code=status.HTTP_202_ACCEPTED,
    responses=problems(403),
    summary="Delete my account (the password, or Google again): hidden and signed out now, deleted after 7 days",
)
async def request_deletion(
    body: DeletionIn, request: Request, response: Response, *, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> DeletionOut:
    done = await service.request_deletion(ctx, db, auth.user.id, body, request.app.state.google)
    hub: RealtimeHub = request.app.state.realtime
    await service.announce(hub, auth.user.id, done.closed)  # its connections close (4401); chats close live
    if cookies.MEMBER_COOKIE in request.cookies:
        cookies.clear(response)  # every session has ended: the web app's cookie goes too (D152)
    return DeletionOut(purge_after=done.purge_after)
