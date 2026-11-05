"""/v1/blocks, /v1/matches/{id}/unmatch, /v1/reports."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.discovery.models import Match
from app.modules.safety import service
from app.modules.safety.schemas import BlockedOut, BlockIn, ReportIn, ReportOut
from app.openapi import problems
from app.realtime import RealtimeHub

router = APIRouter(prefix="/v1", tags=["safety"], responses=problems(401, 422, 429))


async def publish_closed(request: Request, match: Match | None) -> None:
    """Both apps drop the conversation. No reason is sent: to the other
    person a block looks the same as an unmatch."""
    if match is not None:
        hub: RealtimeHub = request.app.state.realtime
        await hub.publish([match.user_a_id, match.user_b_id], {"type": "match.closed", "match_id": str(match.id)})


@router.post(
    "/blocks",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Block someone: they can't see or reach you anywhere, and any match ends",
)
async def block(body: BlockIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await ctx.limiter.hit(service.BLOCK_LIMIT, str(auth.user.id))
    await publish_closed(request, await service.block(db, auth.user.id, body.user_id, ctx.clock()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/blocks", summary="People I have blocked")
async def blocks(auth: CurrentSession, db: DbSession) -> list[BlockedOut]:
    return await service.my_blocks(db, auth.user.id)


@router.delete(
    "/blocks/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unblock (an ended match is not restored)",
)
async def unblock(user_id: uuid.UUID, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await ctx.limiter.hit(service.BLOCK_LIMIT, str(auth.user.id))
    await service.unblock(db, auth.user.id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/matches/{match_id}/unmatch",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problems(404),
    summary="End a match: the conversation closes for both",
)
async def unmatch(match_id: uuid.UUID, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await ctx.limiter.hit(service.UNMATCH_LIMIT, str(auth.user.id))
    await publish_closed(request, await service.unmatch(db, auth.user.id, match_id, ctx.clock()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reports",
    status_code=status.HTTP_201_CREATED,
    responses=problems(404),
    summary="Report a profile, one of their photos or one of their messages (blocks them unless `block` is false)",
)
async def report(body: ReportIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> ReportOut:
    await ctx.limiter.hit(service.REPORT_LIMIT, str(auth.user.id))
    out, closed = await service.report(db, auth.user.id, body, ctx.clock())
    await publish_closed(request, closed)
    return out


@router.get("/reports/mine", summary="My reports and their status")
async def my_reports(auth: CurrentSession, db: DbSession) -> list[ReportOut]:
    return await service.my_reports(db, auth.user.id)
