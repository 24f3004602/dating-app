"""/v1/auth: sign-up, email verification, sign-in, sessions, password reset."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Request, Response, status

from app.modules.auth import cookies, service
from app.modules.auth import google as google_auth
from app.modules.auth.deps import AuthCtx, ClientIp, CurrentSession, DbSession
from app.modules.auth.schemas import (
    Accepted,
    EmailIn,
    GoogleCompleteIn,
    GoogleConfigOut,
    GoogleSignInIn,
    GoogleSignInOut,
    LoginIn,
    PasswordResetConfirmIn,
    RegisterIn,
    SessionOut,
    VerifyEmailIn,
)
from app.openapi import problems
from app.providers.google import GoogleSignIn
from app.realtime import RealtimeHub


def _hub(request: Request) -> RealtimeHub:
    hub: RealtimeHub = request.app.state.realtime
    return hub


router = APIRouter(prefix="/v1/auth", tags=["auth"], responses=problems(422, 429, 503))

# The web app's session cookie (D152): absent, the session comes back as a bearer token.
SessionCookie = Annotated[
    cookies.CookieMode | None,
    Header(
        alias=cookies.TRANSPORT_HEADER,
        description="The web app: keep the session in an HttpOnly cookie, until it expires or the browser closes",
    ),
]


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
async def verify_email(
    body: VerifyEmailIn,
    request: Request,
    response: Response,
    *,
    ctx: AuthCtx,
    db: DbSession,
    ip: ClientIp,
    cookie: SessionCookie = None,
) -> SessionOut:
    out = await service.verify_email(ctx, db, body, ip, request.headers.get("user-agent"))
    return cookies.deliver(out, response, cookie, ctx.clock())


@router.post("/resend-code", status_code=status.HTTP_202_ACCEPTED, summary="Send a new sign-up code")
async def resend_code(body: EmailIn, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> Accepted:
    await service.resend_code(ctx, db, body.email, ip)
    return Accepted()


@router.post("/login", responses=problems(401, 403), summary="Sign in with email and password")
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    *,
    ctx: AuthCtx,
    db: DbSession,
    ip: ClientIp,
    cookie: SessionCookie = None,
) -> SessionOut:
    out = await service.login(ctx, db, body, ip, request.headers.get("user-agent"))
    return cookies.deliver(out, response, cookie, ctx.clock())


@router.post(
    "/restore",
    responses=problems(401, 403),
    summary="Sign in and keep an account that is waiting to be deleted (otherwise the same as sign-in)",
)
async def restore(
    body: LoginIn,
    request: Request,
    response: Response,
    *,
    ctx: AuthCtx,
    db: DbSession,
    ip: ClientIp,
    cookie: SessionCookie = None,
) -> SessionOut:
    out = await service.login(ctx, db, body, ip, request.headers.get("user-agent"), restore=True)
    return cookies.deliver(out, response, cookie, ctx.clock())


def _google(request: Request) -> GoogleSignIn:
    found: GoogleSignIn = request.app.state.google
    return found


@router.get("/google", summary="Whether Google sign-in is on, and what the apps need to start it (D134)")
async def google_config(request: Request, ctx: AuthCtx) -> GoogleConfigOut:
    client_id = _google(request).client_id
    return GoogleConfigOut(
        enabled=client_id is not None, client_id=client_id,
        redirect_uri=ctx.settings.google_redirect_uri if client_id is not None else None,
    )  # fmt: skip


@router.post(
    "/google",
    responses=problems(401, 403, 409),
    summary="Sign in with Google: the phone's ID token or the web app's code; signed in, or a ticket to finish",
)
async def google_sign_in(
    body: GoogleSignInIn,
    request: Request,
    response: Response,
    *,
    ctx: AuthCtx,
    db: DbSession,
    ip: ClientIp,
    cookie: SessionCookie = None,
) -> GoogleSignInOut:
    out = await google_auth.sign_in(
        ctx, db, _google(request), body, ip=ip, user_agent=request.headers.get("user-agent")
    )
    if out.session is None:
        return out  # someone new: a ticket to finish, no session yet
    return out.model_copy(update={"session": cookies.deliver(out.session, response, cookie, ctx.clock())})


@router.post(
    "/google/complete",
    status_code=status.HTTP_201_CREATED,
    responses=problems(400, 403, 409),
    summary="Finish a Google sign-up: date of birth (18+) and the current documents; opens a session",
)
async def google_complete(
    body: GoogleCompleteIn,
    request: Request,
    response: Response,
    *,
    ctx: AuthCtx,
    db: DbSession,
    ip: ClientIp,
    cookie: SessionCookie = None,
) -> SessionOut:
    out = await google_auth.complete(ctx, db, body, ip, request.headers.get("user-agent"))
    return cookies.deliver(out, response, cookie, ctx.clock())


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, responses=problems(401), summary="End this session")
async def logout(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.logout(db, auth.session, ctx.clock())
    await _hub(request).revoke(auth.user.id, auth.session.id)  # closes this session's realtime connections
    return _signed_out(request)


@router.post(
    "/logout-all", status_code=status.HTTP_204_NO_CONTENT, responses=problems(401), summary="End every session"
)
async def logout_all(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.logout_all(db, auth.user.id, ctx.clock())
    await _hub(request).revoke(auth.user.id)
    return _signed_out(request)


def _signed_out(request: Request) -> Response:
    """204, and the web app's cookie removed if it came with one (D152)."""
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if cookies.MEMBER_COOKIE in request.cookies:
        cookies.clear(response)
    return response


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
async def confirm_password_reset(
    body: PasswordResetConfirmIn, request: Request, ctx: AuthCtx, db: DbSession, ip: ClientIp
) -> Response:
    user_id = await service.confirm_password_reset(ctx, db, body, ip)
    await _hub(request).revoke(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
