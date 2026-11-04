"""/v1/me/photos and /v1/media: upload, order, delete, signed delivery."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Form, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.errors import ApiError
from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.media import service
from app.modules.profiles.schemas import PhotoOrderIn, PhotoOut, PhotoUploadForm
from app.openapi import problems
from app.policies.access import can_view_photo
from app.providers.storage import InvalidKeyError, LocalObjectStorage, MemoryObjectStorage, ObjectStorage, photo_keys

router = APIRouter(prefix="/v1", tags=["photos"], responses=problems(401, 422))


def _storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


@router.get("/me/photos", summary="My photos in order, including pending ones")
async def my_photos(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> list[PhotoOut]:
    now = ctx.clock()
    return [service.photo_out(p, _storage(request), now) for p in await service.list_photos(db, auth.user.id)]


@router.post(
    "/me/photos",
    status_code=status.HTTP_201_CREATED,
    responses=problems(409, 413, 429),
    summary="Upload a photo (JPEG, PNG or WebP; at most 10 MB and 40 megapixels)",
)
async def upload(
    request: Request, form: Annotated[PhotoUploadForm, Form()], auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> PhotoOut:
    await ctx.limiter.hit(service.UPLOAD_LIMIT, str(auth.user.id))
    data = await form.file.read(ctx.settings.photo_max_bytes + 1)
    photo = await service.upload_photo(db, ctx.settings, _storage(request), auth.user.id, data=data, now=ctx.clock())
    return service.photo_out(photo, _storage(request), ctx.clock())


@router.patch("/me/photos/order", summary="Reorder my photos (list every photo once)")
async def reorder(
    body: PhotoOrderIn, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> list[PhotoOut]:
    photos = await service.reorder_photos(db, auth.user.id, body.photo_ids)
    now = ctx.clock()
    return [service.photo_out(p, _storage(request), now) for p in photos]


@router.delete(
    "/me/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, responses=problems(404), summary="Delete a photo"
)
async def delete(photo_id: uuid.UUID, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> Response:
    await service.delete_photo(db, ctx.jobs, auth.user.id, photo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/media/{photo_id}",
    status_code=status.HTTP_302_FOUND,
    responses=problems(404),
    summary="Redirect to a short-lived signed URL, if the access policy allows (otherwise 404)",
)
async def media(
    photo_id: uuid.UUID,
    *,
    request: Request,
    auth: CurrentSession,
    ctx: AuthCtx,
    db: DbSession,
    size: Annotated[Literal["large", "small"], Query()] = "large",
) -> RedirectResponse:
    photo = await service.get_photo(db, photo_id)
    if photo is None or not await can_view_photo(db, auth.user.id, photo, settings=ctx.settings, now=ctx.clock()):
        raise ApiError(404, "not_found")
    url, _ = _storage(request).signed_url(photo_keys(photo.storage_key)[size], ctx.clock())
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": "no-store"})


@router.get(
    "/media/blob/{key:path}",
    responses=problems(404),
    include_in_schema=False,  # an implementation detail of the local and memory backends
)
async def blob(
    key: str, request: Request, ctx: AuthCtx, exp: Annotated[int, Query()], sig: Annotated[str, Query(max_length=64)]
) -> Response:
    storage = _storage(request)
    if not isinstance(storage, LocalObjectStorage | MemoryObjectStorage):
        raise ApiError(404, "not_found")
    try:
        valid = storage.verify(key, exp, sig, ctx.clock())
        data = await storage.get(key) if valid else None
    except InvalidKeyError:
        data = None
    if data is None:
        raise ApiError(404, "not_found")
    return Response(
        data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300", "Content-Disposition": "inline"},
    )
