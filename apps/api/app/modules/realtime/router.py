"""/v1/realtime/ticket and the /v1/realtime WebSocket (D025, D074).

Protocol (server to client, JSON text frames):
- `ready`: subscribed. Catch up through REST now; later events arrive live.
- `message.created` {match_id, n}, `match.created` {match_id},
  `read.updated` {match_id, last_read_n}: refetch what changed.
- `resync`: hints may have been missed; refetch everything visible.
- `ping`: a heartbeat every `REALTIME_HEARTBEAT_S`. A client that hears
  nothing for two intervals should reconnect.

Close codes: 4401 the session ended (sign in again); 4429 too many
connections (wait before retrying); 1012 the server lost its subscription
(reconnect with backoff); 1008 the client misbehaved. A refused or reused
ticket fails the handshake itself (HTTP 403).

Clients send nothing that matters: frames are read only to notice a
disconnect, and a flood closes the connection.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Request, WebSocket, status
from redis.exceptions import RedisError
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.config import Settings
from app.errors import ApiError
from app.modules.auth.deps import AuthCtx, CurrentSession
from app.modules.auth.service import AuthContext, session_is_live
from app.openapi import problems
from app.ratelimit import Limit
from app.realtime import CLOSE, RealtimeHub, RealtimeUnavailableError, Ticket
from app.schemas import ApiModel

logger = logging.getLogger("app.realtime")

TICKET_LIMIT = Limit("realtime_tickets", 120, 3600)
CLOSE_SESSION_ENDED = 4401
CLOSE_TOO_MANY = 4429
CLOSE_RESTART = 1012
CLOSE_POLICY = 1008
CLOSE_ERROR = 1011
# Client frames allowed per heartbeat interval before the connection is closed.
_CLIENT_FRAMES_PER_BEAT = 30

router = APIRouter(prefix="/v1/realtime", tags=["realtime"])


class TicketOut(ApiModel):
    ticket: str
    expires_in: int


def _hub(app: Any) -> RealtimeHub:
    hub: RealtimeHub = app.state.realtime
    return hub


@router.post(
    "/ticket",
    status_code=status.HTTP_201_CREATED,
    responses=problems(401, 429, 503),
    summary="A single-use ticket for opening the realtime WebSocket (valid 30 seconds)",
)
async def ticket(request: Request, auth: CurrentSession, ctx: AuthCtx) -> TicketOut:
    await ctx.limiter.hit(TICKET_LIMIT, str(auth.user.id))
    try:
        value = await _hub(request.app).issue_ticket(auth.user.id, auth.session.id, ctx.settings.realtime_ticket_ttl_s)
    except (RedisError, OSError) as exc:
        raise ApiError(503, "realtime_unavailable", "Live updates are unavailable. Please try again shortly.") from exc
    return TicketOut(ticket=value, expires_in=ctx.settings.realtime_ticket_ttl_s)


async def _live(app: Any, ticket: Ticket) -> bool:
    auth: AuthContext = app.state.auth
    async with app.state.session_factory() as db:
        return await session_is_live(db, ticket.session_id, ticket.user_id, auth.clock())


async def _drain(websocket: WebSocket, settings: Settings) -> int | None:
    """Read client frames until the client leaves (None) or floods (1008)."""
    window_start, frames = time.monotonic(), 0
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return None
        frames += 1
        if time.monotonic() - window_start > settings.realtime_heartbeat_s:
            window_start, frames = time.monotonic(), 1
        if frames > _CLIENT_FRAMES_PER_BEAT:
            return CLOSE_POLICY


async def _forward(websocket: WebSocket, item: Any, ticket: Ticket) -> int | None:
    """Send one event to the client, or return the close code it calls for."""
    if item == CLOSE:
        return CLOSE_RESTART
    if item.get("type") == "session.revoked":
        return CLOSE_SESSION_ENDED if item.get("session_id") in (None, str(ticket.session_id)) else None
    await websocket.send_json(item)
    return None


async def _pump(websocket: WebSocket, queue: asyncio.Queue[Any], ticket: Ticket, conn_id: str) -> int | None:
    """Forward events until something ends the connection. Returns the close
    code to send, or None if the client already left."""
    app = websocket.app
    settings: Settings = app.state.settings
    hub = _hub(app)
    loop = asyncio.get_running_loop()
    next_beat = loop.time() + settings.realtime_heartbeat_s
    next_check = loop.time() + settings.realtime_revalidate_s
    reader = asyncio.create_task(_drain(websocket, settings))
    getter: asyncio.Task[Any] | None = None
    try:
        while True:
            if getter is None:
                getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait(
                {reader, getter}, timeout=max(0.0, min(next_beat, next_check) - loop.time()),
                return_when=asyncio.FIRST_COMPLETED,
            )  # fmt: skip
            if reader in done:
                return reader.result()
            if getter in done:
                item, getter = getter.result(), None
                code = await _forward(websocket, item, ticket)
                if code is not None:
                    return code
            now = loop.time()
            if now >= next_beat:
                await websocket.send_json({"type": "ping"})
                await hub.refresh_slot(ticket.user_id, conn_id, settings.realtime_heartbeat_s * 3)
                next_beat = now + settings.realtime_heartbeat_s
            if now >= next_check:
                if not await _live(app, ticket):
                    return CLOSE_SESSION_ENDED
                next_check = now + settings.realtime_revalidate_s
    finally:
        for task in (reader, getter):
            if task is not None:
                task.cancel()
        await asyncio.gather(*(t for t in (reader, getter) if t is not None), return_exceptions=True)


@router.websocket("")
async def realtime(websocket: WebSocket) -> None:
    app = websocket.app
    settings: Settings = app.state.settings
    hub = _hub(app)
    started = time.perf_counter()
    close_code: int | None = None
    conn_id = uuid.uuid4().hex
    ticket: Ticket | None = None
    claimed = False
    try:
        try:
            ticket = await hub.redeem_ticket(websocket.query_params.get("ticket", ""))
        except (RedisError, OSError):
            close_code = CLOSE_ERROR
        else:
            if ticket is None or not await _live(app, ticket):
                close_code = CLOSE_POLICY
        if close_code is not None or ticket is None:
            await websocket.close(code=close_code or CLOSE_POLICY)  # before accept: the handshake fails (403)
            return

        claimed = await hub.claim_slot(
            ticket.user_id, conn_id, settings.realtime_heartbeat_s * 3, settings.realtime_max_connections
        )
        await websocket.accept()
        if not claimed:
            close_code = CLOSE_TOO_MANY
            return
        async with hub.subscribe(ticket.user_id) as queue:
            await websocket.send_json({"type": "ready"})
            close_code = await _pump(websocket, queue, ticket, conn_id)
    except (RedisError, OSError, RealtimeUnavailableError):
        close_code = CLOSE_RESTART
    except WebSocketDisconnect:
        close_code = None
    finally:
        if ticket is not None and claimed:
            await hub.release_slot(ticket.user_id, conn_id)
        # Before accept, closing fails the handshake (403); after it, it sends the close code.
        if close_code is not None and websocket.application_state is not WebSocketState.DISCONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close(code=close_code)
        logger.info(
            "realtime connection ended",
            extra={
                "event": "realtime.closed",
                "close_code": close_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
