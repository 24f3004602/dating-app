"""Fixed-window rate limits in Redis.

- Subjects (emails, IPs, user IDs) are keyed by an HMAC, so Redis never holds
  a plain email address or IP (privacy inventory: rate-limit counters).
- Limits keyed on an email apply whether or not an account exists, so a 429
  reveals nothing about existence (T04).
- Fail closed: if Redis is unreachable the request is refused with 503
  rather than let through unlimited (architecture: auth limits fail closed).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.errors import ApiError

logger = logging.getLogger("app.ratelimit")


@dataclass(frozen=True)
class Limit:
    name: str
    limit: int
    window_s: int


class RateLimiter:
    def __init__(self, redis: Redis, key: bytes, prefix: str) -> None:
        self._redis = redis
        self._key = key
        self._prefix = prefix

    def _redis_key(self, limit: Limit, subject: str) -> str:
        digest = hmac.new(self._key, subject.encode(), hashlib.sha256).hexdigest()[:32]
        return f"{self._prefix}:{limit.name}:{digest}"

    def _unavailable(self, exc: Exception) -> ApiError:
        logger.error(
            "rate limiter unavailable", extra={"event": "ratelimit.unavailable", "error_type": type(exc).__name__}
        )
        return ApiError(503, "rate_limit_unavailable", "Please try again shortly.", headers={"Retry-After": "30"})

    async def hit(self, limit: Limit, subject: str) -> None:
        """Count one event; raise 429 once the window's limit is exceeded."""
        key = self._redis_key(limit, subject)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, limit.window_s, nx=True)
                pipe.ttl(key)
                count, _, ttl = await pipe.execute()
        except (RedisError, OSError) as exc:
            raise self._unavailable(exc) from exc
        if int(count) > limit.limit:
            raise ApiError(
                429, "rate_limited", "Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(max(1, int(ttl)))},
            )  # fmt: skip

    async def check(self, limit: Limit, subject: str) -> None:
        """Raise 429 if the count is already at the limit, without counting."""
        key = self._redis_key(limit, subject)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.get(key)
                pipe.ttl(key)
                count, ttl = await pipe.execute()
        except (RedisError, OSError) as exc:
            raise self._unavailable(exc) from exc
        if count is not None and int(count) >= limit.limit:
            raise ApiError(
                429, "rate_limited", "Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(max(1, int(ttl)))},
            )  # fmt: skip

    async def record(self, limit: Limit, subject: str) -> None:
        """Count one event without raising (e.g. a failed attempt)."""
        key = self._redis_key(limit, subject)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, limit.window_s, nx=True)
                await pipe.execute()
        except (RedisError, OSError) as exc:
            raise self._unavailable(exc) from exc
