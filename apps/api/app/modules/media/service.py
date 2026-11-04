"""Photos: upload, list, reorder, delete, and signed delivery.

Order of an upload: decode and re-encode off the event loop, write both
sizes to private storage, then insert the row. If the insert fails the
objects are removed again. Deleting a row queues the object deletion in the
same transaction (`media:delete_objects`), so storage is cleaned even if the
API stops right after the commit.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.jobs import JobQueue
from app.modules.accounts.models import User
from app.modules.media.images import ImageRejectedError, process_image
from app.modules.media.models import ModerationState, Photo
from app.modules.profiles.schemas import PhotoOut, PhotoUrls
from app.providers.storage import ObjectStorage, new_photo_base, photo_keys
from app.ratelimit import Limit

DELETE_OBJECTS = "media:delete_objects"
UPLOAD_LIMIT = Limit("photo_upload", 30, 3600)
MIN_APPROVED_FOR_DISCOVERY = 2

_REJECTION_TEXT = {
    "empty_file": "The file is empty.",
    "file_too_large": "Photos can be at most 10 MB.",
    "too_many_pixels": "That photo is too large in pixels (at most 40 megapixels).",
    "animated_image": "Animated images aren't allowed.",
    "image_too_small": "That photo is too small; use one at least 300 pixels on each side.",
    "unsupported_image": "Use a JPEG, PNG or WebP photo.",
    "corrupt_image": "That file couldn't be read as a photo.",
}


async def _lock_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Serialise one member's photo changes (uploads, reorders, deletes)."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def list_photos(session: AsyncSession, user_id: uuid.UUID) -> list[Photo]:
    rows = await session.execute(select(Photo).where(Photo.user_id == user_id).order_by(Photo.position))
    return list(rows.scalars())


def photo_out(photo: Photo, storage: ObjectStorage, now: datetime) -> PhotoOut:
    keys = photo_keys(photo.storage_key)
    large, expires = storage.signed_url(keys["large"], now)
    small, _ = storage.signed_url(keys["small"], now)
    return PhotoOut(
        id=photo.id,
        position=photo.position,
        moderation_state=photo.moderation_state,
        width=photo.width,
        height=photo.height,
        urls=PhotoUrls(large=large, small=small),
        urls_expire_at=expires,
    )


async def upload_photo(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user_id: uuid.UUID, *, data: bytes, now: datetime
) -> Photo:
    await _lock_user(session, user_id)
    existing = await list_photos(session, user_id)
    if len(existing) >= settings.photo_max_count:
        raise ApiError(409, "photo_limit", f"You can have at most {settings.photo_max_count} photos.")
    try:
        processed = await asyncio.to_thread(
            process_image,
            data,
            max_bytes=settings.photo_max_bytes,
            max_pixels=settings.photo_max_pixels,
            min_side=settings.photo_min_side,
        )
    except ImageRejectedError as exc:
        raise ApiError(422, exc.code, _REJECTION_TEXT.get(exc.code, "That photo can't be used.")) from exc

    base = new_photo_base()
    keys = photo_keys(base)
    await storage.put(keys["large"], processed.large, "image/jpeg")
    await storage.put(keys["small"], processed.small, "image/jpeg")
    try:
        photo = Photo(
            user_id=user_id,
            position=len(existing),
            storage_key=base,
            width=processed.width,
            height=processed.height,
            sha256=processed.sha256,
            moderation_state=ModerationState.pending if settings.photo_review_required else ModerationState.approved,
            created_at=now,
        )
        session.add(photo)
        await session.commit()
    except BaseException:
        for key in keys.values():
            await storage.delete(key)
        raise
    return photo


async def _renumber(session: AsyncSession, ordered: list[Photo]) -> None:
    await session.execute(text("SET CONSTRAINTS uq_photos_user_id_position DEFERRED"))
    for position, photo in enumerate(ordered):
        photo.position = position
    await session.flush()


async def reorder_photos(session: AsyncSession, user_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> list[Photo]:
    await _lock_user(session, user_id)
    photos = await list_photos(session, user_id)
    by_id = {p.id: p for p in photos}
    if len(photo_ids) != len(set(photo_ids)) or set(photo_ids) != set(by_id):
        # Unknown, foreign or missing IDs all look the same (no existence leak).
        raise ApiError(422, "invalid_photo_order", "List each of your photos exactly once.")
    await _renumber(session, [by_id[i] for i in photo_ids])
    await session.commit()
    return await list_photos(session, user_id)


async def delete_photo(session: AsyncSession, jobs: JobQueue, user_id: uuid.UUID, photo_id: uuid.UUID) -> None:
    await _lock_user(session, user_id)
    photos = await list_photos(session, user_id)
    target = next((p for p in photos if p.id == photo_id), None)
    if target is None:
        raise ApiError(404, "not_found")
    await session.execute(delete(Photo).where(Photo.id == target.id))
    remaining = [p for p in photos if p.id != target.id]
    await _renumber(session, remaining)
    await jobs.defer(session, DELETE_OBJECTS, keys=list(photo_keys(target.storage_key).values()))
    await session.commit()


async def delete_objects(storage: ObjectStorage, keys: list[str]) -> None:
    for key in keys:
        await storage.delete(key)


async def get_photo(session: AsyncSession, photo_id: uuid.UUID) -> Photo | None:
    return await session.get(Photo, photo_id)
