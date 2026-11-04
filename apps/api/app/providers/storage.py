"""Private object storage behind an interface (architecture: media).

Keys are random and carry no user information. Objects are never public:
clients get a short-lived signed URL (5 minutes by default).

- `LocalObjectStorage` (development): files under `media_dir`; URLs are
  HMAC-signed links to this API's own `/v1/media/blob/...` route.
- `MemoryObjectStorage` (tests).
- A bucket adapter (S3 in ap-south-1 or R2, with presigned GETs) arrives with
  the owner's account; production refuses to start without it (Settings).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import os
import re
import secrets
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlencode

from app.config import Settings

# e.g. "p/3q2-7wEAAAAAAAAAbWFkZSB1cC0x/l.jpg": no dots in segments, no "..".
KEY_PATTERN = re.compile(r"^p/[A-Za-z0-9_-]{16,64}/[ls]\.jpg$")


class InvalidKeyError(ValueError):
    pass


def check_key(key: str) -> str:
    if not KEY_PATTERN.fullmatch(key):
        raise InvalidKeyError("invalid object key")
    return key


def new_photo_base() -> str:
    return secrets.token_urlsafe(24)


def photo_keys(base: str) -> dict[str, str]:
    return {"large": check_key(f"p/{base}/l.jpg"), "small": check_key(f"p/{base}/s.jpg")}


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes | None: ...
    async def delete(self, key: str) -> None: ...
    def signed_url(self, key: str, now: datetime) -> tuple[str, datetime]: ...


class _ApiSignedUrls:
    """Signed links to /v1/media/blob for backends served by the API itself."""

    def __init__(self, signing_key: bytes, ttl_s: int) -> None:
        self._key = signing_key
        self._ttl = ttl_s

    def _sig(self, key: str, exp: int) -> str:
        return hmac.new(self._key, f"{key}\n{exp}".encode(), hashlib.sha256).hexdigest()

    def signed_url(self, key: str, now: datetime) -> tuple[str, datetime]:
        check_key(key)
        expires = now + timedelta(seconds=self._ttl)
        exp = int(expires.timestamp())
        query = urlencode({"exp": exp, "sig": self._sig(key, exp)})
        return f"/v1/media/blob/{quote(key)}?{query}", expires

    def verify(self, key: str, exp: int, sig: str, now: datetime) -> bool:
        if exp < int(now.timestamp()):
            return False
        return hmac.compare_digest(self._sig(key, exp), sig)


class MemoryObjectStorage(_ApiSignedUrls):
    def __init__(self, signing_key: bytes, ttl_s: int) -> None:
        super().__init__(signing_key, ttl_s)
        self.objects: dict[str, tuple[bytes, str]] = {}

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[check_key(key)] = (data, content_type)

    async def get(self, key: str) -> bytes | None:
        found = self.objects.get(check_key(key))
        return found[0] if found else None

    async def delete(self, key: str) -> None:
        self.objects.pop(check_key(key), None)


class LocalObjectStorage(_ApiSignedUrls):
    def __init__(self, root: Path, signing_key: bytes, ttl_s: int) -> None:
        super().__init__(signing_key, ttl_s)
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / check_key(key)).resolve()
        if self.root not in path.parents:
            raise InvalidKeyError("key escapes the storage root")
        return path

    def _put_sync(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".upload-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            Path(tmp).replace(path)  # atomic on the same volume
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def _get_sync(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def _delete_sync(self, key: str) -> None:
        path = self._path(key)
        path.unlink(missing_ok=True)
        with contextlib.suppress(OSError):  # not empty (the other size) or already gone
            path.parent.rmdir()

    # File I/O runs in a thread so it never blocks the event loop.
    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(self._put_sync, key, data)

    async def get(self, key: str) -> bytes | None:
        return await asyncio.to_thread(self._get_sync, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)


def create_storage(settings: Settings, signing_key: bytes) -> LocalObjectStorage | MemoryObjectStorage:
    if settings.storage_backend == "memory":
        return MemoryObjectStorage(signing_key, settings.media_url_ttl_s)
    if settings.is_production:
        raise RuntimeError("local storage is not allowed in production")
    return LocalObjectStorage(Path(settings.media_dir), signing_key, settings.media_url_ttl_s)
