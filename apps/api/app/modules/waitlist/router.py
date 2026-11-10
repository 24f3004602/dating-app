"""/v1/waitlist: join, confirm, leave (stage 20c, D101). Called by the website's server."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.modules.auth.deps import AuthCtx, ClientIp, DbSession
from app.modules.auth.schemas import Accepted
from app.modules.waitlist import service
from app.modules.waitlist.schemas import JoinIn, TokenIn
from app.openapi import problems

router = APIRouter(prefix="/v1/waitlist", tags=["waitlist"], responses=problems(422, 429, 503))


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Join the waitlist; a confirmation link is emailed (the same answer for every address)",
)
async def join(body: JoinIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Accepted:
    await service.join(ctx, db, body, ip)
    return Accepted()


@router.post(
    "/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problems(400),
    summary="Confirm a place with the token from the emailed link (works once, for 7 days)",
)
async def confirm(body: TokenIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Response:
    await service.confirm(ctx, db, body.token, ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave the waitlist with the link from any waitlist email; the address is deleted",
)
async def leave(body: TokenIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Response:
    await service.leave(ctx, db, body.token, ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
