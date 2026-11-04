"""/v1/auth: sign-up, email verification, sign-in, sessions, password reset."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.modules.auth import service
from app.modules.auth.deps import AuthCtx, ClientIp, CurrentSession, DbSession
from app.modules.auth.schemas import (
    Accepted,
    EmailIn,
    LoginIn,
    PasswordResetConfirmIn,
    RegisterIn,
    SessionOut,
    VerifyEmailIn,
)
from app.openapi import problems

router = APIRouter(prefix="/v1/auth", tags=["auth"], responses=problems(422, 429, 503))


@router.post(
    "/register",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Sign up; a code is emailed (same answer whether or not the address has an account)",
)
async def register(body: RegisterIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Accepted:
    await service.register(ctx, db, body, ip)
    return Accepted()


@router.post(
    "/verify-email",
    status_code=status.HTTP_201_CREATED,
    responses=problems(400),
    summary="Confirm the email with the code and the sign-up password; opens a session",
)
async def verify_email(body: VerifyEmailIn, request: Request, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> SessionOut:
    return await service.verify_email(ctx, db, body, ip, request.headers.get("user-agent"))


@router.post("/resend-code", status_code=status.HTTP_202_ACCEPTED, summary="Send a new sign-up code")
async def resend_code(body: EmailIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Accepted:
    await service.resend_code(ctx, db, body.email, ip)
    return Accepted()


@router.post("/login", responses=problems(401, 403), summary="Sign in with email and password")
async def login(body: LoginIn, request: Request, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> SessionOut:
    return await service.login(ctx, db, body, ip, request.headers.get("user-agent"))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, responses=problems(401), summary="End this session")
async def logout(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.logout(db, auth.session, ctx.clock())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/logout-all", status_code=status.HTTP_204_NO_CONTENT, responses=problems(401), summary="End every session"
)
async def logout_all(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.logout_all(db, auth.user.id, ctx.clock())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/password-reset/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a reset code (same answer whether or not the address has an account)",
)
async def request_password_reset(body: EmailIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Accepted:
    await service.request_password_reset(ctx, db, body.email, ip)
    return Accepted()


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problems(400),
    summary="Set a new password with the code; signs out every session",
)
async def confirm_password_reset(body: PasswordResetConfirmIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Response:
    await service.confirm_password_reset(ctx, db, body, ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
