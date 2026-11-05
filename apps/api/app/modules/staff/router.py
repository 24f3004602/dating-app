"""/v1/admin/auth: staff sign-in with a second factor; /v1/admin/staff: enrolment tokens (D090).

The admin console (Next.js) calls these from its server and keeps the staff
token in an HttpOnly, Secure, SameSite=Strict cookie; browsers never see it.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status

from app.modules.auth.deps import AuthCtx, ClientIp, CurrentStaffSession, DbSession
from app.modules.moderation.deps import AdminSession, StaffSession
from app.modules.staff import service
from app.modules.staff.challenges import Challenges
from app.modules.staff.schemas import (
    ChallengeOut,
    EnrollIn,
    EnrollmentTokenOut,
    EnrollOut,
    StaffLoginIn,
    StaffMe,
    StaffMember,
    StaffSessionOut,
    VerifyIn,
)
from app.openapi import problems

router = APIRouter(prefix="/v1/admin", tags=["staff"], responses=problems(422, 429, 503))


def _challenges(request: Request) -> Challenges:
    found: Challenges = request.app.state.staff_challenges
    return found


@router.post("/auth/login", responses=problems(401), summary="Staff sign-in, step 1: email and password")
async def login(body: StaffLoginIn, request: Request, ctx: AuthCtx, db: DbSession, ip: ClientIp) -> ChallengeOut:
    return await service.staff_login(ctx, _challenges(request), db, body, ip)


@router.post(
    "/auth/enroll",
    responses=problems(400, 409),
    summary="Set up an authenticator with a one-time enrolment token from an admin",
)
async def enroll(body: EnrollIn, request: Request, ctx: AuthCtx, db: DbSession) -> EnrollOut:
    return await service.enroll(ctx, _challenges(request), db, body)


@router.post(
    "/auth/verify",
    status_code=status.HTTP_201_CREATED,
    responses=problems(400),
    summary="Staff sign-in, step 2: a code from the authenticator (or a recovery code); opens a staff session",
)
async def verify(body: VerifyIn, request: Request, ctx: AuthCtx, db: DbSession) -> StaffSessionOut:
    return await service.verify(ctx, _challenges(request), db, body, request.headers.get("user-agent"))


@router.get("/auth/me", responses=problems(401, 403), summary="The signed-in staff member")
async def me(auth: StaffSession, db: DbSession) -> StaffMe:
    return await service.staff_me(db, auth.user)


@router.post(
    "/auth/logout", status_code=status.HTTP_204_NO_CONTENT, responses=problems(401), summary="End this staff session"
)
async def logout(auth: CurrentStaffSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.staff_logout(db, auth.session, ctx.clock())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/staff", responses=problems(401, 403), summary="Staff accounts and their authenticators (admin)")
async def staff_list(auth: AdminSession, db: DbSession) -> list[StaffMember]:
    return await service.staff_list(db, auth.user)


@router.post(
    "/staff/{user_id}/enrollment",
    status_code=status.HTTP_201_CREATED,
    responses=problems(401, 403, 404, 409),
    summary="Reset a staff member's authenticator and issue a one-time enrolment token (admin)",
)
async def issue_enrollment(user_id: uuid.UUID, auth: AdminSession, ctx: AuthCtx, db: DbSession) -> EnrollmentTokenOut:
    await ctx.limiter.hit(service.ISSUE_LIMIT, str(auth.user.id))
    token, expires = await service.issue_enrollment(db, ctx.settings, auth.user, user_id, ctx.clock())
    return EnrollmentTokenOut(enrollment_token=token, expires_at=expires)
