"""Photo checks for the blue tick (stage 29b, D164).

The member asks for a gesture (one of six, chosen by the server, the same one until its 15
minutes run out, so it can't be re-rolled to match an old photo), then sends a selfie making it.
Our staff see the selfie beside every photo of the member's and approve or reject it. Only an
approval sets the tick. Whatever the decision, the selfie's files are deleted in the decision's
transaction (a queued job); a selfie nobody decides is deleted after `UNDECIDED_SELFIE`. Adding a
photo clears the tick and cancels a selfie still waiting (media.service.upload_photo, which
keeps that step itself so the two modules don't import each other).

Each member's changes are serialised on their user row, as photo uploads are, so a decision and
an upload can't cross.
"""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.jobs import JobQueue
from app.modules.accounts.models import User
from app.modules.audit.service import record
from app.modules.media.images import ImageRejectedError, process_image
from app.modules.media.models import ModerationState, Photo
from app.modules.media.service import DELETE_OBJECTS, list_photos, photo_out, rejected_image
from app.modules.photochecks.models import CheckState, Gesture, PhotoCheck
from app.modules.photochecks.schemas import (
    CheckDecisionIn,
    CheckDecisionOut,
    MemberState,
    PendingCheckOut,
    PhotoCheckOut,
)
from app.modules.privacy import retention
from app.modules.profiles.models import Profile
from app.modules.profiles.schemas import PhotoUrls
from app.providers.storage import ObjectStorage, new_photo_base, photo_keys
from app.ratelimit import Limit

GESTURE_TIME = timedelta(minutes=15)
GESTURE_LIMIT = Limit("photo_check_gesture", 20, 3600)
SELFIE_LIMIT = Limit("photo_check_selfie", 6, 86400)
OPEN = (CheckState.awaiting, CheckState.pending)


async def _lock_member(session: AsyncSession, user_id: uuid.UUID) -> None:
    """The same lock as a photo upload's, so the two can't interleave."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update(key_share=True))


async def _open(session: AsyncSession, user_id: uuid.UUID) -> PhotoCheck | None:
    stmt = select(PhotoCheck).where(PhotoCheck.user_id == user_id, PhotoCheck.state.in_(OPEN)).with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


def _out(state: MemberState, **fields: object) -> PhotoCheckOut:
    empty: dict[str, object] = {"gesture": None, "expires_at": None, "reason": None, "verified_at": None}
    return PhotoCheckOut.model_validate({"state": state, **empty, **fields})


# How a member's latest check reads once no gesture is running and no tick is set.
_AFTER: dict[CheckState, MemberState] = {
    CheckState.pending: "pending",
    CheckState.rejected: "rejected",
    CheckState.approved: "removed",  # approved, but the tick went: a photo was added since
}


async def my_check(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> PhotoCheckOut:
    profile = await session.get(Profile, user_id)
    if profile is not None and profile.photo_verified_at is not None:
        return _out("verified", verified_at=profile.photo_verified_at)
    latest = (
        await session.execute(
            select(PhotoCheck)
            .where(PhotoCheck.user_id == user_id)
            .order_by(PhotoCheck.created_at.desc(), PhotoCheck.state.in_(OPEN).desc())  # an open one wins a tie
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is None:
        return _out("none")
    ends = latest.created_at + GESTURE_TIME
    if latest.state is CheckState.awaiting and now < ends:
        return _out("awaiting", gesture=latest.gesture, expires_at=ends)
    state = _AFTER.get(latest.state, "none")  # cancelled or expired: start again
    return _out(state, reason=latest.reason if state == "rejected" else None)


async def give_gesture(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> PhotoCheckOut:
    """The gesture to make; the same one while its time runs, a new one after."""
    await _lock_member(session, user_id)
    profile = await session.get(Profile, user_id)
    if profile is None:
        raise ApiError(409, "profile_required", "Create your profile first.")
    if profile.photo_verified_at is not None:
        raise ApiError(409, "already_verified", "Your photos are already verified.")
    approved = await session.scalar(
        select(func.count())
        .select_from(Photo)
        .where(Photo.user_id == user_id, Photo.moderation_state == ModerationState.approved)
    )
    if not approved:
        raise ApiError(409, "photos_required", "Add a photo first: our team compares your selfie with your photos.")
    current = await _open(session, user_id)
    if current is not None and current.state is CheckState.pending:
        raise ApiError(409, "check_pending", "Your selfie is waiting for our team.")
    if current is not None and now < current.created_at + GESTURE_TIME:
        await session.commit()
        return await my_check(session, user_id, now)
    if current is not None:
        current.state = CheckState.expired
        await session.flush()
    session.add(PhotoCheck(user_id=user_id, gesture=secrets.choice(list(Gesture)), state=CheckState.awaiting,
                           created_at=now))  # fmt: skip
    await session.commit()
    return await my_check(session, user_id, now)


async def send_selfie(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user_id: uuid.UUID, *, data: bytes, now: datetime
) -> PhotoCheckOut:
    await _lock_member(session, user_id)
    check = await _open(session, user_id)
    if check is None or check.state is not CheckState.awaiting or now >= check.created_at + GESTURE_TIME:
        raise ApiError(409, "gesture_expired", "Your gesture's time ran out. Start again for a new one.")
    try:
        processed = await asyncio.to_thread(
            process_image,
            data,
            max_bytes=settings.photo_max_bytes,
            max_pixels=settings.photo_max_pixels,
            min_side=settings.photo_min_side,
        )
    except ImageRejectedError as exc:
        raise rejected_image(exc) from exc
    base = new_photo_base()
    keys = photo_keys(base)
    await storage.put(keys["large"], processed.large, "image/jpeg")
    await storage.put(keys["small"], processed.small, "image/jpeg")
    try:
        check.state = CheckState.pending
        check.storage_key = base
        check.submitted_at = now
        record(session, "photo_check.sent", actor=user_id, target_type="photo_check", target_id=check.id)
        await session.commit()
    except BaseException:
        for key in keys.values():
            await storage.delete(key)
        raise
    return await my_check(session, user_id, now)


async def pending_checks(
    session: AsyncSession, storage: ObjectStorage, staff: User, limit: int, *, now: datetime
) -> list[PendingCheckOut]:
    rows = (
        await session.execute(
            select(PhotoCheck, Profile.display_name)
            .outerjoin(Profile, Profile.user_id == PhotoCheck.user_id)
            .where(PhotoCheck.state == CheckState.pending)
            .order_by(PhotoCheck.submitted_at, PhotoCheck.id)
            .limit(limit)
        )
    ).all()
    out: list[PendingCheckOut] = []
    for check, name in rows:
        if check.storage_key is None or check.submitted_at is None:  # the table's checks rule this out
            continue
        keys = photo_keys(check.storage_key)
        large, expires = storage.signed_url(keys["large"], now)
        small, _ = storage.signed_url(keys["small"], now)
        photos = [photo_out(p, storage, now) for p in await list_photos(session, check.user_id)]
        out.append(
            PendingCheckOut(
                id=check.id, user_id=check.user_id, display_name=name, gesture=check.gesture,
                submitted_at=check.submitted_at, selfie=PhotoUrls(large=large, small=small),
                selfie_expires_at=expires, photos=photos,
            )
        )  # fmt: skip
    record(session, "admin.photo_checks_viewed", actor=staff.id, count=len(out))
    await session.commit()
    return out


async def decide(
    session: AsyncSession, jobs: JobQueue, staff: User, check_id: uuid.UUID, body: CheckDecisionIn, *, now: datetime
) -> CheckDecisionOut:
    owner = await session.scalar(select(PhotoCheck.user_id).where(PhotoCheck.id == check_id))
    if owner is None:
        raise ApiError(404, "not_found")
    if owner == staff.id:
        raise ApiError(409, "own_account", "Staff can't review their own photo check.")
    await _lock_member(session, owner)
    check = (
        await session.execute(select(PhotoCheck).where(PhotoCheck.id == check_id).with_for_update())
    ).scalar_one_or_none()
    if check is None:  # the account was deleted meanwhile
        raise ApiError(404, "not_found")
    if check.state is not CheckState.pending or check.storage_key is None:
        raise ApiError(409, "already_decided", "This check has already been decided, or was withdrawn.")
    keys = list(photo_keys(check.storage_key).values())
    approve = body.decision == "approve"
    check.state = CheckState.approved if approve else CheckState.rejected
    check.reason = None if approve else body.reason
    check.decided_at = now
    check.decided_by = staff.id
    check.storage_key = None
    if approve:
        await session.execute(update(Profile).where(Profile.user_id == owner).values(photo_verified_at=now))
    await jobs.defer(session, DELETE_OBJECTS, keys=keys)  # the selfie goes with the decision
    record(
        session, "admin.photo_check_decided", actor=staff.id, target_type="photo_check", target_id=check.id,
        decision=body.decision, **({"reason": body.reason.value} if body.reason else {}),
    )  # fmt: skip
    await session.commit()
    return CheckDecisionOut(id=check.id, state=check.state)


async def expire(session: AsyncSession, jobs: JobQueue, now: datetime) -> dict[str, int]:
    """Gestures not used in time, and selfies nobody decided within `UNDECIDED_SELFIE`. Commits."""
    gestures = (
        await session.execute(
            update(PhotoCheck)
            .where(PhotoCheck.state == CheckState.awaiting, PhotoCheck.created_at < now - GESTURE_TIME)
            .values(state=CheckState.expired)
            .returning(PhotoCheck.id)
        )
    ).all()
    stale = (
        (
            await session.execute(
                select(PhotoCheck)
                .where(
                    PhotoCheck.state == CheckState.pending,
                    PhotoCheck.submitted_at < now - retention.UNDECIDED_SELFIE,
                )
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    keys: list[str] = []
    for check in stale:
        if check.storage_key is not None:
            keys += photo_keys(check.storage_key).values()
        check.state = CheckState.expired
        check.storage_key = None
    if keys:
        await jobs.defer(session, DELETE_OBJECTS, keys=keys)
    counts = {"gestures": len(gestures), "selfies": len(stale)}
    if any(counts.values()):
        record(session, "photo_check.expired", actor=None, gestures=counts["gestures"], selfies=counts["selfies"])
    await session.commit()
    return counts


async def selfie_keys(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """A waiting selfie's object keys, for the account purge."""
    base = await session.scalar(
        select(PhotoCheck.storage_key).where(PhotoCheck.user_id == user_id, PhotoCheck.storage_key.is_not(None))
    )
    return list(photo_keys(base).values()) if base else []
