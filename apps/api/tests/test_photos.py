"""F02 photos: upload, signed delivery, moderation visibility, reorder, delete,
limits, and another member's photos staying invisible (T05, T09, T10)."""

from __future__ import annotations

import dataclasses
import io
import uuid
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.accounts.models import User
from app.modules.media.models import Photo
from app.modules.media.service import UPLOAD_LIMIT
from tests import images
from tests.support import FrozenClock, JobRunner, bearer, signup

Db = async_sessionmaker[AsyncSession]


async def member(client: AsyncClient, jobs: JobRunner, email: str) -> dict[str, str]:
    session = await signup(client, jobs, email)
    return {"id": session["user"]["id"], **bearer(session["token"])}


def auth(who: dict[str, str]) -> dict[str, str]:
    return {"authorization": who["authorization"]}


async def upload(client: AsyncClient, who: dict[str, str], data: bytes | None = None, **kw: Any) -> Any:
    files = {"file": ("photo.jpg", data if data is not None else images.jpeg(exif=images.gps_exif()), "image/jpeg")}
    return await client.post("/v1/me/photos", files=files, headers=auth(who), **kw)


async def test_upload_stores_two_clean_sizes_pending_review(app: FastAPI, client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    r = await upload(client, me)
    assert r.status_code == 201, r.text
    photo = r.json()
    assert photo["moderation_state"] == "pending"  # D026
    assert photo["position"] == 0
    assert (photo["width"], photo["height"]) == (1080, 810)
    storage = app.state.storage
    assert len(storage.objects) == 2
    for blob, content_type in storage.objects.values():
        assert content_type == "image/jpeg"
        assert b"SecretPhone" not in blob  # metadata gone, GPS included

    fetched = await client.get(photo["urls"]["large"])  # the signed URL needs no session
    assert fetched.status_code == 200
    assert fetched.headers["content-type"] == "image/jpeg"
    assert fetched.headers["cache-control"] == "private, max-age=300"
    assert len(Image.open(io.BytesIO(fetched.content)).getexif()) == 0


async def test_signed_urls_expire_and_cannot_be_forged(
    client: AsyncClient, jobs: JobRunner, clock: FrozenClock
) -> None:
    me = await member(client, jobs, "a@example.com")
    url = (await upload(client, me)).json()["urls"]["small"]
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    forged = f"{parsed.path}?exp={int(query['exp'][0]) + 3600}&sig={query['sig'][0]}"
    assert (await client.get(forged)).status_code == 404
    assert (await client.get(f"{parsed.path}?exp={query['exp'][0]}&sig={'0' * 64}")).status_code == 404
    assert (await client.get(f"/v1/media/blob/p/../../etc/passwd?exp=9999999999&sig={'0' * 64}")).status_code == 404
    clock.advance(minutes=6)
    assert (await client.get(url)).status_code == 404  # expired after 5 minutes


async def test_photos_are_auto_approved_only_when_review_is_off(
    app: FastAPI, client: AsyncClient, jobs: JobRunner
) -> None:
    me = await member(client, jobs, "a@example.com")
    review_off = app.state.settings.model_copy(update={"photo_review_required": False})
    app.state.auth = dataclasses.replace(app.state.auth, settings=review_off)
    r = await upload(client, me)
    assert r.json()["moderation_state"] == "approved"


async def test_invalid_uploads_are_rejected_with_clear_codes(
    app: FastAPI, client: AsyncClient, jobs: JobRunner
) -> None:
    me = await member(client, jobs, "a@example.com")
    cases = {
        b"<html><body>not a photo</body></html>": "unsupported_image",
        images.animated("WEBP"): "animated_image",
        images.jpeg((250, 250)): "image_too_small",
        images.png_header_only(60_000, 60_000): "too_many_pixels",
        b"x" * (10 * 1024 * 1024 + 1): "file_too_large",  # fits the request limit, fails the photo limit
    }
    for data, code in cases.items():
        r = await upload(client, me, data)
        assert r.status_code == 422, code
        assert r.json()["code"] == code
    assert app.state.storage.objects == {}  # nothing was stored for any of them

    huge = await upload(client, me, b"x" * (12 * 1024 * 1024))  # beyond the upload request limit
    assert huge.status_code == 413
    no_file = await client.post("/v1/me/photos", data={"note": "x"}, headers=auth(me))
    assert no_file.status_code == 422
    extra = await client.post(  # an unknown form field next to the file
        "/v1/me/photos",
        files={"file": ("photo.jpg", images.jpeg(), "image/jpeg")},
        data={"moderation_state": "approved"},
        headers=auth(me),
    )
    assert extra.status_code == 422
    assert extra.json()["errors"][0]["type"] == "extra_forbidden"


async def test_at_most_six_photos(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    for i in range(6):
        assert (
            await upload(client, me, images.jpeg(color=("red", "blue", "green", "gray", "pink", "navy")[i]))
        ).status_code == 201
    r = await upload(client, me)
    assert r.status_code == 409
    assert r.json()["code"] == "photo_limit"


async def test_uploads_are_rate_limited(app: FastAPI, client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    limiter = app.state.auth.limiter
    await app.state.redis.set(limiter._redis_key(UPLOAD_LIMIT, me["id"]), UPLOAD_LIMIT.limit, ex=3600)
    r = await upload(client, me)
    assert r.status_code == 429


async def test_reorder_and_delete_keep_positions_compact(app: FastAPI, client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    ids = [(await upload(client, me, images.jpeg(color=c))).json()["id"] for c in ("red", "green", "blue")]

    r = await client.patch("/v1/me/photos/order", json={"photo_ids": [ids[2], ids[0], ids[1]]}, headers=auth(me))
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == [ids[2], ids[0], ids[1]]
    assert [p["position"] for p in r.json()] == [0, 1, 2]

    for bad in ([ids[0], ids[1]], [ids[0], ids[0], ids[1]], [*ids[:2], str(uuid.uuid4())]):
        r = await client.patch("/v1/me/photos/order", json={"photo_ids": bad}, headers=auth(me))
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_photo_order"

    assert len(app.state.storage.objects) == 6
    assert (await client.delete(f"/v1/me/photos/{ids[0]}", headers=auth(me))).status_code == 204
    remaining = (await client.get("/v1/me/photos", headers=auth(me))).json()
    assert [(p["id"], p["position"]) for p in remaining] == [(ids[2], 0), (ids[1], 1)]
    assert len(app.state.storage.objects) == 6  # objects go in the queued job, not the request
    await jobs.run()
    assert len(app.state.storage.objects) == 4
    assert (await client.delete(f"/v1/me/photos/{ids[0]}", headers=auth(me))).status_code == 404


async def test_another_members_photos_are_invisible(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    asha = await member(client, jobs, "asha@example.com")
    ravi = await member(client, jobs, "ravi@example.com")
    photo_id = (await upload(client, asha)).json()["id"]

    own = await client.get(f"/v1/media/{photo_id}", headers=auth(asha))
    assert own.status_code == 302
    assert own.headers["location"].startswith("/v1/media/blob/")

    # Pending: invisible to others. Approved: still invisible without a relation (stages 8-9).
    for state in ("pending", "approved"):
        async with db() as s:
            photo = await s.get(Photo, uuid.UUID(photo_id))
            assert photo is not None
            photo.moderation_state = state  # type: ignore[assignment]
            await s.commit()
        assert (await client.get(f"/v1/media/{photo_id}", headers=auth(ravi))).status_code == 404
    assert (await client.get(f"/v1/media/{uuid.uuid4()}", headers=auth(ravi))).status_code == 404
    assert (await client.delete(f"/v1/me/photos/{photo_id}", headers=auth(ravi))).status_code == 404
    r = await client.patch("/v1/me/photos/order", json={"photo_ids": [photo_id]}, headers=auth(ravi))
    assert r.status_code == 422
    assert (await client.get("/v1/me/photos", headers=auth(ravi))).json() == []
    assert (await client.get(f"/v1/media/{photo_id}")).status_code == 401


async def test_deleting_the_account_removes_photo_rows(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    me = await member(client, jobs, "a@example.com")
    await upload(client, me)
    async with db() as s:
        await s.execute(delete(User).where(User.id == uuid.UUID(me["id"])))
        await s.commit()
        assert (await s.execute(select(func.count()).select_from(Photo))).scalar_one() == 0
    # The stored objects are removed by the account purge (stage 12), not by the cascade.
