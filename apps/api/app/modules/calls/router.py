"""/v1/live and /v1/calls: Live, random one-to-one video calls (stage 23, D123).

Realtime: `call.updated` {call_id} goes to the other person whenever a call
changes (paired, offer, answer, connected, ended): refetch the call.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status

from app.errors import ApiError
from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.calls import service
from app.modules.calls.schemas import CallOut, EndIn, IceOut, IceServerOut, LiveOut, QueueIn, QueueOut, RulesIn, SdpIn
from app.openapi import problems
from app.providers.ice import IceProvider, IceUnavailableError, NoIce
from app.realtime import RealtimeHub

router = APIRouter(tags=["live"], responses=problems(401, 422, 429))


def _ice(request: Request) -> IceProvider:
    found: IceProvider = request.app.state.ice
    return found


def _available(request: Request) -> bool:
    return not isinstance(_ice(request), NoIce)


async def _tell(request: Request, to: list[uuid.UUID], call_id: uuid.UUID) -> None:
    if to:
        hub: RealtimeHub = request.app.state.realtime
        await hub.publish(to, {"type": "call.updated", "call_id": str(call_id)})


@router.get("/v1/live", summary="Live at a glance: free calls left, the plan, an open call")
async def live(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> LiveOut:
    return await service.live(db, ctx.settings, auth.user, _available(request), ctx.clock())


@router.put("/v1/live/rules", responses=problems(409), summary="Accept the Live rules (the version shown)")
async def accept_rules(body: RulesIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> LiveOut:
    await service.accept_rules(db, auth.user.id, body.version, ctx.clock())
    return await service.live(db, ctx.settings, auth.user, _available(request), ctx.clock())


@router.post(
    "/v1/live/queue",
    responses=problems(409, 503),
    summary="Wait for someone, or be paired now. Also the heartbeat while waiting",
)
async def join(body: QueueIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> QueueOut:
    await ctx.limiter.hit(service.QUEUE_LIMIT, str(auth.user.id))
    joined = await service.join(
        db, ctx.settings, auth.user, client_id=body.client_id, available=_available(request), now=ctx.clock()
    )
    if joined.out.call is not None:
        await _tell(request, joined.notify, joined.out.call.id)
    return joined.out


@router.delete("/v1/live/queue", status_code=status.HTTP_204_NO_CONTENT, summary="Stop waiting")
async def leave(auth: CurrentSession, db: DbSession) -> Response:
    await service.leave(db, auth.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/v1/calls/{call_id}", responses=problems(404), summary="One of my calls, with the other side's description"
)
async def get_call(call_id: uuid.UUID, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> CallOut:
    await ctx.limiter.hit(service.SIGNAL_LIMIT, str(auth.user.id))
    return await service.get(db, ctx.settings, call_id, auth.user.id, ctx.clock())


@router.post(
    "/v1/calls/{call_id}/ice",
    responses=problems(404, 409, 503),
    summary="Relay servers for this call, with credentials that last only as long as it may",
)
async def ice(call_id: uuid.UUID, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> IceOut:
    await ctx.limiter.hit(service.ICE_LIMIT, str(auth.user.id))
    ttl = await service.ice_ttl(db, ctx.settings, call_id, auth.user.id, ctx.clock())
    provider = _ice(request)
    try:
        servers = await provider.servers(ttl)
    except IceUnavailableError as exc:
        raise ApiError(
            503, "live_unavailable", "Live isn't available right now. Please try again later.",
            headers={"Retry-After": "60"},
        ) from exc  # fmt: skip
    return IceOut(
        policy="relay" if provider.relay_only else "all",
        servers=[IceServerOut(urls=s.urls, username=s.username, credential=s.credential) for s in servers],
        ttl_s=ttl,
    )


@router.put("/v1/calls/{call_id}/offer", responses=problems(404, 409), summary="The offerer's description")
async def offer(
    call_id: uuid.UUID, body: SdpIn, *, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> CallOut:
    await ctx.limiter.hit(service.SIGNAL_LIMIT, str(auth.user.id))
    out, peer = await service.offer(
        db, ctx.settings, call_id, auth.user.id, sdp=body.sdp, relay_only=_ice(request).relay_only, now=ctx.clock()
    )
    await _tell(request, [peer], call_id)
    return out


@router.put("/v1/calls/{call_id}/answer", responses=problems(404, 409), summary="The answerer's description")
async def answer(
    call_id: uuid.UUID, body: SdpIn, *, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> CallOut:
    await ctx.limiter.hit(service.SIGNAL_LIMIT, str(auth.user.id))
    out, peer = await service.answer(
        db, ctx.settings, call_id, auth.user.id, sdp=body.sdp, relay_only=_ice(request).relay_only, now=ctx.clock()
    )
    await _tell(request, [peer], call_id)
    return out


@router.post(
    "/v1/calls/{call_id}/connected",
    responses=problems(404, 409),
    summary="This device is connected. The first report starts the call's clock",
)
async def connected(call_id: uuid.UUID, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> CallOut:
    await ctx.limiter.hit(service.SIGNAL_LIMIT, str(auth.user.id))
    out, notify = await service.connected(db, ctx.settings, call_id, auth.user.id, ctx.clock())
    await _tell(request, notify, call_id)
    return out


@router.post("/v1/calls/{call_id}/end", responses=problems(404), summary="Hang up (or move on, or report)")
async def end(
    call_id: uuid.UUID, body: EndIn, *, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> CallOut:
    out, notify = await service.end(db, ctx.settings, call_id, auth.user.id, reason=body.reason, now=ctx.clock())
    await _tell(request, notify, call_id)
    return out
