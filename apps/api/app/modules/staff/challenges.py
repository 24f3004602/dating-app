"""Staff sign-in challenges in Redis (D090).

After the right password, a staff member gets a challenge: a random value
stored only as its SHA-256, for five minutes, good for five wrong codes. The
second factor (or a first enrolment) is checked against it, and a successful
check deletes it. A pending enrolment keeps its new secret here, encrypted.
Like the rate limits, this fails closed: no Redis, no staff sign-in.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.errors import ApiError
from app.modules.staff.crypto import challenge_digest, new_challenge

MAX_ATTEMPTS = 5


@dataclass(frozen=True)
class Challenge:
    user_id: uuid.UUID
    pending_secret: bytes | None
    enrollment_id: uuid.UUID | None


def _unavailable(exc: Exception) -> ApiError:
    return ApiError(503, "rate_limit_unavailable", "Please try again shortly.", headers={"Retry-After": "30"})


class Challenges:
    def __init__(self, redis: Redis, prefix: str) -> None:
        self._redis = redis
        self._prefix = prefix

    def _key(self, value: str) -> str:
        return f"{self._prefix}:staff:challenge:{challenge_digest(value)}"

    async def create(self, user_id: uuid.UUID, ttl_s: int) -> str:
        value, _ = new_challenge()
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.hset(self._key(value), mapping={"user_id": str(user_id), "attempts": 0})
                pipe.expire(self._key(value), ttl_s)
                await pipe.execute()
        except (RedisError, OSError) as exc:
            raise _unavailable(exc) from exc
        return value

    async def get(self, value: str) -> Challenge | None:
        try:
            data = await self._redis.hgetall(self._key(value))
        except (RedisError, OSError) as exc:
            raise _unavailable(exc) from exc
        if not data:
            return None
        fields = {k.decode() if isinstance(k, bytes) else k: v for k, v in data.items()}
        pending = fields.get("pending")
        enrollment = fields.get("enrollment")
        return Challenge(
            user_id=uuid.UUID(_text(fields["user_id"])),
            pending_secret=bytes.fromhex(_text(pending)) if pending else None,
            enrollment_id=uuid.UUID(_text(enrollment)) if enrollment else None,
        )

    async def set_pending(self, value: str, secret_enc: bytes, enrollment_id: uuid.UUID) -> None:
        try:
            await self._redis.hset(
                self._key(value), mapping={"pending": secret_enc.hex(), "enrollment": str(enrollment_id)}
            )
        except (RedisError, OSError) as exc:
            raise _unavailable(exc) from exc

    async def failed(self, value: str) -> None:
        """Count a wrong code; the challenge goes after the fifth."""
        key = self._key(value)
        try:
            attempts = await self._redis.hincrby(key, "attempts", 1)
            if attempts >= MAX_ATTEMPTS:
                await self._redis.delete(key)
        except (RedisError, OSError) as exc:
            raise _unavailable(exc) from exc

    async def consume(self, value: str) -> None:
        try:
            await self._redis.delete(self._key(value))
        except (RedisError, OSError) as exc:
            raise _unavailable(exc) from exc


def _text(v: bytes | str) -> str:
    return v.decode() if isinstance(v, bytes) else v
