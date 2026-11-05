"""/v1/matches/{id}/messages, /v1/matches/{id}/read, /v1/safety/nudge-terms."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.messaging import nudge, service
from app.modules.messaging.schemas import MessageIn, MessageOut, MessagePage, NudgeTermsOut, ReadIn, ReadOut
from app.openapi import problems
from app.realtime import RealtimeHub

router = APIRouter(prefix="/v1", tags=["messaging"], responses=problems(401, 422, 429))


def _hub(request: Request) -> RealtimeHub:
    hub: RealtimeHub = request.app.state.realtime
    return hub


@router.get(
    "/matches/{match_id}/messages",
    responses=problems(404),
    summary="Conversation history: the latest page, older (`before`) or newer (`after`) messages",
)
async def list_messages(
    match_id: uuid.UUID,
    *,
    auth: CurrentSession,
    ctx: AuthCtx,
    db: DbSession,
    before: Annotated[int | None, Query(ge=1)] = None,
    after: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=service.PAGE_MAX)] = service.PAGE_DEFAULT,
) -> MessagePage:
    await ctx.limiter.hit(service.READ_LIMIT, str(auth.user.id))
    return await service.history(db, auth.user.id, match_id, before=before, after=after, limit=limit)


@router.post(
    "/matches/{match_id}/messages",
    status_code=status.HTTP_201_CREATED,
    responses={
        **problems(404, 409),
        200: {"model": MessageOut, "description": "A retry with the same `client_message_id`: the stored message"},
    },
    summary="Send a message in an open match (idempotent by `client_message_id`)",
)
async def send_message(
    match_id: uuid.UUID,
    body: MessageIn,
    *,
    request: Request,
    response: Response,
    auth: CurrentSession,
    ctx: AuthCtx,
    db: DbSession,
) -> MessageOut:
    me = str(auth.user.id)
    await ctx.limiter.hit(service.SEND_BURST, me)
    await ctx.limiter.hit(service.SEND_LIMIT, me)
    out, created, match = await service.send(db, auth.user.id, match_id, body, ctx.clock())
    if created:
        await _hub(request).publish(
            [match.user_a_id, match.user_b_id], {"type": "message.created", "match_id": str(match.id), "n": out.n}
        )
    else:
        response.status_code = status.HTTP_200_OK
    return out


@router.post(
    "/matches/{match_id}/read",
    responses=problems(404),
    summary="Move my read pointer forward (the other person is never told)",
)
async def mark_read(
    match_id: uuid.UUID, body: ReadIn, *, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> ReadOut:
    await ctx.limiter.hit(service.READ_LIMIT, str(auth.user.id))
    out = await service.mark_read(db, auth.user.id, match_id, body.up_to_n, ctx.clock())
    # My other devices update their unread counts.
    await _hub(request).publish(
        [auth.user.id], {"type": "read.updated", "match_id": str(match_id), "last_read_n": out.last_read_n}
    )
    return out


@router.get("/safety/nudge-terms", summary="Words that trigger a pre-send nudge or a safety tip")
async def nudge_terms(response: Response, auth: CurrentSession) -> NudgeTermsOut:
    response.headers["Cache-Control"] = "private, max-age=3600"
    return NudgeTermsOut(version=nudge.VERSION, hurtful=list(nudge.HURTFUL), money=list(nudge.MONEY))
