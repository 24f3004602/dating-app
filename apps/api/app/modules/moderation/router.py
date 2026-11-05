"""/v1/admin: the moderation queue, photo review, account actions, the audit log."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.deps import AuthCtx, DbSession
from app.modules.auth.service import AuthContext
from app.modules.moderation import service
from app.modules.moderation.deps import AdminSession, StaffSession
from app.modules.moderation.schemas import (
    AccountActionIn,
    ActionOut,
    AuditEntryOut,
    PendingPhoto,
    PhotoDecisionIn,
    QueueItem,
    ReportActionIn,
    ReportDetail,
)
from app.modules.notifications import service as notify
from app.modules.safety.models import ActionKind, ReportStatus
from app.openapi import problems
from app.providers.storage import ObjectStorage
from app.realtime import RealtimeHub

router = APIRouter(prefix="/v1/admin", tags=["admin"], responses=problems(401, 403, 422))

Limit = Annotated[int, Query(ge=1, le=100)]


def _storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


async def _announce(request: Request, effects: service.Effects, db: AsyncSession) -> None:
    hub: RealtimeHub = request.app.state.realtime
    for user_id in effects.revoke:
        await hub.revoke(user_id)
    for m in effects.closed:
        await hub.publish([m.user_a_id, m.user_b_id], {"type": "match.closed", "match_id": str(m.id)})
    auth: AuthContext = request.app.state.auth
    for user_id in effects.noticed:
        await notify.request_push(
            db, auth.jobs, request.app.state.redis, auth.settings.rate_limit_prefix,
            user_id=user_id, kind=notify.Kind.notice,
        )  # fmt: skip


@router.get("/reports", summary="The queue: open and in-review reports, most urgent first")
async def reports(
    staff: StaffSession, db: DbSession, status: ReportStatus | None = None, limit: Limit = 50
) -> list[QueueItem]:
    return await service.queue(db, staff.user, status, limit)


@router.get("/reports/{report_id}", responses=problems(404), summary="A report with its minimal context (audited)")
async def report(
    report_id: uuid.UUID, request: Request, staff: StaffSession, ctx: AuthCtx, db: DbSession
) -> ReportDetail:
    return await service.report_detail(db, ctx.settings, _storage(request), staff.user, report_id, now=ctx.clock())


@router.post(
    "/reports/{report_id}/actions",
    status_code=201,
    responses=problems(404, 409),
    summary="Resolve a report: dismiss, warn, remove the photo or message, suspend, or ban (admin)",
)
async def act(
    report_id: uuid.UUID, body: ReportActionIn, *, request: Request, staff: StaffSession, ctx: AuthCtx, db: DbSession
) -> ActionOut:
    out, effects = await service.act_on_report(
        db, staff.user, report_id, ActionKind(body.action), body.note, now=ctx.clock()
    )
    await _announce(request, effects, db)
    return out


@router.get("/photos/pending", summary="Photos waiting for review, oldest first (audited)")
async def pending(
    request: Request, staff: StaffSession, ctx: AuthCtx, db: DbSession, limit: Limit = 50
) -> list[PendingPhoto]:
    return await service.pending_photos(db, _storage(request), staff.user, limit, now=ctx.clock())


@router.post(
    "/photos/{photo_id}/decision",
    status_code=201,
    responses=problems(404, 409),
    summary="Approve or reject a photo",
)
async def decide_photo(
    photo_id: uuid.UUID, body: PhotoDecisionIn, staff: StaffSession, ctx: AuthCtx, db: DbSession
) -> ActionOut:
    return await service.decide_photo(db, staff.user, photo_id, body.decision == "approve", body.note, now=ctx.clock())


@router.post(
    "/users/{user_id}/actions",
    status_code=201,
    responses=problems(409),
    summary="Suspend (moderator), ban or reinstate (admin) an account",
)
async def account_action(
    user_id: uuid.UUID, body: AccountActionIn, *, request: Request, staff: StaffSession, ctx: AuthCtx, db: DbSession
) -> ActionOut:
    out, effects = await service.account_action(
        db, staff.user, user_id, ActionKind(body.action), body.note, now=ctx.clock()
    )
    await _announce(request, effects, db)
    return out


@router.get("/audit-log", summary="The latest audit entries (admin; audited)")
async def audit_log(admin: AdminSession, db: DbSession, limit: Limit = 100) -> list[AuditEntryOut]:
    return await service.audit_entries(db, admin.user, limit)
