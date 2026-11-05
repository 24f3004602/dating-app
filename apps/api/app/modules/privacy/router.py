"""/v1/me/deletion: delete my account (D083)."""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.discovery.models import Match
from app.modules.matching.service import other_of
from app.modules.privacy import service
from app.modules.privacy.schemas import DeletionIn, DeletionOut
from app.openapi import problems
from app.realtime import RealtimeHub

router = APIRouter(prefix="/v1", tags=["account"], responses=problems(401, 422, 429))


@router.post(
    "/me/deletion",
    status_code=status.HTTP_202_ACCEPTED,
    responses=problems(403),
    summary="Delete my account: hidden and signed out now, everything deleted after 7 days",
)
async def request_deletion(
    body: DeletionIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> DeletionOut:
    done = await service.request_deletion(ctx, db, auth.user.id, body.password)
    hub: RealtimeHub = request.app.state.realtime
    await hub.revoke(auth.user.id)  # closes every realtime connection of this account (4401)
    match: Match
    for match in done.closed:
        await hub.publish([other_of(match, auth.user.id)], {"type": "match.closed", "match_id": str(match.id)})
    return DeletionOut(purge_after=done.purge_after)
