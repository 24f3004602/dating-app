"""The moderation queue, photo review and account actions (F06, T10-T12,
T15; D081).

Rules enforced here, on the server:
- every route needs a staff role (`deps.py`); banning, reinstating and the
  audit log need an admin;
- staff never act on their own account, and moderators act on members only;
- staff see a report's minimal context: the reported item, what members
  could see of the person, the account state and earlier actions. The only
  message text they see is the copy in the report. No email, birthdate,
  location or conversations;
- every read and every action writes an audit entry, and every action an
  append-only moderation record.

Effects: suspending or banning revokes every session (and closes realtime
connections); a ban also closes the person's open matches. A removed
message stays stored but shows as removed; a removed photo is rejected
(hidden from everyone but its owner).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.modules.accounts.models import User, UserRole, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.audit.service import record
from app.modules.auth.service import age_on, local_today, revoke_all_sessions
from app.modules.discovery.models import Match, MatchCloseReason
from app.modules.media.models import ModerationState, Photo
from app.modules.media.service import list_photos, photo_out
from app.modules.messaging.models import Message
from app.modules.moderation.schemas import (
    ActionOut,
    AuditEntryOut,
    PendingPhoto,
    QueueItem,
    ReportDetail,
    SubjectBrief,
    SubjectDetail,
)
from app.modules.profiles.models import Profile
from app.modules.profiles.service import prompt_answers
from app.modules.safety.models import ActionKind, ModerationAction, Report, ReportStatus
from app.providers.storage import ObjectStorage

ACTIVE = (ReportStatus.open, ReportStatus.in_review)
ADMIN_ONLY = {ActionKind.ban, ActionKind.reinstate}


@dataclass
class Effects:
    """What the router announces after the commit."""

    revoke: list[uuid.UUID] = field(default_factory=list)
    closed: list[Match] = field(default_factory=list)


def _about(r: Report) -> str:
    return "message" if r.message_id or r.evidence_text else "photo" if r.photo_id else "profile"


def _action_out(a: ModerationAction) -> ActionOut:
    return ActionOut(
        id=a.id,
        action=a.action,
        moderator_id=a.moderator_id,
        target_user_id=a.target_user_id,
        report_id=a.report_id,
        note=a.note,
        created_at=a.created_at,
    )


async def _check_target(session: AsyncSession, staff: User, target_id: uuid.UUID | None, action: ActionKind) -> User:
    if action in ADMIN_ONLY and staff.role is not UserRole.admin:
        raise ApiError(403, "admin_only", "Only an admin can do that.")
    target = await session.get(User, target_id) if target_id else None
    if target is None:
        raise ApiError(409, "account_gone", "That account no longer exists.")
    if target.id == staff.id:
        raise ApiError(409, "own_account", "Staff can't act on their own account.")
    if target.role is not UserRole.member and staff.role is not UserRole.admin:
        raise ApiError(403, "admin_only", "Only an admin can act on a staff account.")
    return target


async def _guard_report(session: AsyncSession, staff: User, r: Report) -> None:
    """No one handles reports about themselves; reports about staff need an admin."""
    if r.subject_id == staff.id:
        raise ApiError(403, "own_account", "Staff can't handle reports about themselves.")
    subject = await session.get(User, r.subject_id) if r.subject_id else None
    if subject is not None and subject.role is not UserRole.member and staff.role is not UserRole.admin:
        raise ApiError(403, "admin_only", "Only an admin can handle reports about staff.")


async def _open_reports_on(session: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(Report).where(Report.subject_id == user_id, Report.status.in_(ACTIVE))
    return int((await session.execute(stmt)).scalar_one())


async def queue(session: AsyncSession, staff: User, status: ReportStatus | None, limit: int) -> list[QueueItem]:
    stmt = select(Report, User.status, Profile.display_name).outerjoin(User, User.id == Report.subject_id)
    stmt = stmt.outerjoin(Profile, Profile.user_id == Report.subject_id)
    stmt = stmt.where(Report.status == status) if status else stmt.where(Report.status.in_(ACTIVE))
    rows = (await session.execute(stmt.order_by(Report.priority, Report.created_at).limit(limit))).all()
    out = []
    for r, account_status, name in rows:
        subject = (
            SubjectBrief(user_id=r.subject_id, display_name=name, account_status=account_status)
            if r.subject_id and account_status
            else None
        )
        out.append(
            QueueItem(
                id=r.id,
                reason=r.reason,
                priority=r.priority,
                status=r.status,
                about=_about(r),
                created_at=r.created_at,
                subject=subject,
                assignee_id=r.assignee_id,
                open_reports_on_subject=await _open_reports_on(session, r.subject_id) if r.subject_id else 0,
            )
        )
    record(session, "admin.queue_viewed", actor=staff.id, count=len(out))
    await session.commit()
    return out


async def _subject_detail(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user_id: uuid.UUID, now: datetime
) -> SubjectDetail | None:
    user = await session.get(User, user_id)
    if user is None:
        return None
    profile = await session.get(Profile, user_id)
    total = await session.scalar(select(func.count()).select_from(Report).where(Report.subject_id == user_id))
    return SubjectDetail(
        user_id=user_id,
        display_name=profile.display_name if profile else None,
        age=age_on(user.birthdate, local_today(settings, now)),
        account_status=user.status,
        joined=user.created_at.date(),
        bio=profile.bio if profile else None,
        prompts=await prompt_answers(session, user_id),
        photos=[photo_out(p, storage, now) for p in await list_photos(session, user_id)],
        reports_on_subject=int(total or 0),
    )


async def _history(session: AsyncSession, user_id: uuid.UUID | None) -> list[ActionOut]:
    if user_id is None:
        return []
    rows = await session.execute(
        select(ModerationAction)
        .where(ModerationAction.target_user_id == user_id)
        .order_by(ModerationAction.created_at.desc())
        .limit(50)
    )
    return [_action_out(a) for a in rows.scalars()]


async def _get_report(session: AsyncSession, report_id: uuid.UUID, *, lock: bool = False) -> Report:
    stmt = select(Report).where(Report.id == report_id)
    if lock:
        stmt = stmt.with_for_update()
    found = (await session.execute(stmt)).scalar_one_or_none()
    if found is None:
        raise ApiError(404, "not_found")
    return found


async def report_detail(
    session: AsyncSession,
    settings: Settings,
    storage: ObjectStorage,
    staff: User,
    report_id: uuid.UUID,
    *,
    now: datetime,
) -> ReportDetail:
    """Opening an open report puts it in review and assigns it to the viewer."""
    r = await _get_report(session, report_id, lock=True)
    await _guard_report(session, staff, r)
    if r.status is ReportStatus.open:
        r.status = ReportStatus.in_review
        r.assignee_id = staff.id
    record(session, "admin.report_viewed", actor=staff.id, target_type="report", target_id=r.id)
    await session.commit()
    photo = await session.get(Photo, r.photo_id) if r.photo_id else None
    message = await session.get(Message, r.message_id) if r.message_id else None
    return ReportDetail(
        id=r.id,
        reason=r.reason,
        details=r.details,
        status=r.status,
        priority=r.priority,
        created_at=r.created_at,
        reporter_id=r.reporter_id,
        assignee_id=r.assignee_id,
        evidence_text=r.evidence_text,
        message_removed=bool(message and message.removed_at),
        photo=photo_out(photo, storage, now) if photo else None,
        subject=await _subject_detail(session, settings, storage, r.subject_id, now) if r.subject_id else None,
        history=await _history(session, r.subject_id),
    )


async def _close_all_matches(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> list[Match]:
    rows = await session.execute(
        select(Match)
        .where(or_(Match.user_a_id == user_id, Match.user_b_id == user_id), Match.closed_at.is_(None))
        .with_for_update(key_share=True)
    )
    closed = list(rows.scalars())
    for m in closed:
        m.closed_at = now
        m.closed_reason = MatchCloseReason.moderation
    return closed


async def _apply_account(
    session: AsyncSession, target: User, action: ActionKind, now: datetime, effects: Effects
) -> None:
    if action is ActionKind.suspend:
        target.status = UserStatus.suspended
    elif action is ActionKind.ban:
        target.status = UserStatus.banned
        effects.closed += await _close_all_matches(session, target.id, now)
    elif action is ActionKind.reinstate:
        if target.status not in (UserStatus.suspended, UserStatus.banned):
            raise ApiError(409, "not_restricted", "That account isn't suspended or banned.")
        target.status = UserStatus.active
        return
    await revoke_all_sessions(session, target.id, now)
    effects.revoke.append(target.id)


async def act_on_report(
    session: AsyncSession, staff: User, report_id: uuid.UUID, action: ActionKind, note: str | None, *, now: datetime
) -> tuple[ActionOut, Effects]:
    r = await _get_report(session, report_id, lock=True)
    await _guard_report(session, staff, r)
    if r.status not in ACTIVE:
        raise ApiError(409, "already_resolved", "This report has already been resolved.")
    effects = Effects()
    if action is not ActionKind.dismiss:
        target = await _check_target(session, staff, r.subject_id, action)
        if action is ActionKind.remove_message:
            message = await session.get(Message, r.message_id) if r.message_id else None
            if message is None:
                raise ApiError(409, "nothing_to_remove", "There is no message to remove.")
            message.removed_at = message.removed_at or now
        elif action is ActionKind.remove_photo:
            photo = await session.get(Photo, r.photo_id) if r.photo_id else None
            if photo is None:
                raise ApiError(409, "nothing_to_remove", "There is no photo to remove.")
            photo.moderation_state = ModerationState.rejected
            photo.reviewed_at = now
        elif action in (ActionKind.suspend, ActionKind.ban):
            await _apply_account(session, target, action, now, effects)
    row = ModerationAction(
        moderator_id=staff.id,
        target_user_id=r.subject_id,
        report_id=r.id,
        photo_id=r.photo_id,
        message_id=r.message_id,
        action=action,
        note=note,
        created_at=now,
    )
    session.add(row)
    r.status = ReportStatus.dismissed if action is ActionKind.dismiss else ReportStatus.actioned
    r.assignee_id = r.assignee_id or staff.id
    r.resolved_at = now
    r.resolved_by = staff.id
    await session.flush()
    record(session, "admin.report_actioned", actor=staff.id, target_type="report", target_id=r.id, action=action.value)
    await session.commit()
    return _action_out(row), effects


async def account_action(
    session: AsyncSession, staff: User, user_id: uuid.UUID, action: ActionKind, note: str, *, now: datetime
) -> tuple[ActionOut, Effects]:
    await session.execute(select(User.id).where(User.id == user_id).with_for_update(key_share=True))
    target = await _check_target(session, staff, user_id, action)
    effects = Effects()
    await _apply_account(session, target, action, now, effects)
    row = ModerationAction(moderator_id=staff.id, target_user_id=user_id, action=action, note=note, created_at=now)
    session.add(row)
    await session.flush()
    record(session, "admin.account_action", actor=staff.id, target_type="user", target_id=user_id, action=action.value)
    await session.commit()
    return _action_out(row), effects


async def pending_photos(
    session: AsyncSession, storage: ObjectStorage, staff: User, limit: int, *, now: datetime
) -> list[PendingPhoto]:
    rows = (
        await session.execute(
            select(Photo, Profile.display_name)
            .outerjoin(Profile, Profile.user_id == Photo.user_id)
            .where(Photo.moderation_state == ModerationState.pending)
            .order_by(Photo.created_at, Photo.id)
            .limit(limit)
        )
    ).all()
    record(session, "admin.photos_viewed", actor=staff.id, count=len(rows))
    await session.commit()
    return [PendingPhoto(user_id=p.user_id, display_name=name, photo=photo_out(p, storage, now)) for p, name in rows]


async def decide_photo(
    session: AsyncSession, staff: User, photo_id: uuid.UUID, approve: bool, note: str | None, *, now: datetime
) -> ActionOut:
    photo = (await session.execute(select(Photo).where(Photo.id == photo_id).with_for_update())).scalar_one_or_none()
    if photo is None:
        raise ApiError(404, "not_found")
    if photo.user_id == staff.id:
        raise ApiError(409, "own_account", "Staff can't review their own photos.")
    photo.moderation_state = ModerationState.approved if approve else ModerationState.rejected
    photo.reviewed_at = now
    kind = ActionKind.approve_photo if approve else ActionKind.reject_photo
    row = ModerationAction(
        moderator_id=staff.id, target_user_id=photo.user_id, photo_id=photo.id, action=kind, note=note, created_at=now
    )
    session.add(row)
    await session.flush()
    record(session, "admin.photo_decided", actor=staff.id, target_type="photo", target_id=photo.id, action=kind.value)
    await session.commit()
    return _action_out(row)


async def audit_entries(session: AsyncSession, staff: User, limit: int) -> list[AuditEntryOut]:
    rows = list((await session.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))).scalars())
    record(session, "admin.audit_viewed", actor=staff.id, count=len(rows))
    await session.commit()
    return [
        AuditEntryOut(
            id=a.id,
            actor_id=a.actor_id,
            action=a.action,
            target_type=a.target_type,
            target_id=a.target_id,
            request_id=a.request_id,
            details=a.details,
            created_at=a.created_at,
        )
        for a in rows
    ]
