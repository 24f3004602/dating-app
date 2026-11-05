"""Realtime hints (D025, D074).

REST is the source of truth. The WebSocket only tells a member's devices that
something changed (`message.created`, `match.created`, `read.updated`), with
IDs and sequence numbers but never message text, so a block or unmatch is
always enforced by the REST read that follows, and no message body passes
through Redis.

- Tickets: single use, 30 seconds, stored in Redis as a SHA-256 digest and
  redeemed with GETDEL. The session token never appears in a URL.
- Fan-out: every API process subscribes once to one channel. An event names
  its recipients, and each process hands it to the connections it holds for
  them. Fine for a few processes; shard the channel when that stops being
  true.
- Gaps: if the subscription breaks, or Redis reconnects underneath it,
  connected clients are told to resync (or are closed) and catch up through
  REST. Publishing is best effort for the same reason: a lost hint costs a
  refresh, never a message.
- Connection cap: a sorted set per member of connection IDs scored by expiry,
  refreshed on each heartbeat, so a crashed process frees its slots.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import secrets
import time
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from typing import Any

from redis.asyncio import Redis
from redis.asyncio.client import PubSub
from redis.exceptions import RedisError

logger = logging.getLogger("app.realtime")

# Queue items that are not client events.
CLOSE = "close"  # the hub failed: close the connection so the client reconnects and catches up
RESYNC: dict[str, Any] = {"type": "resync"}  # events may have been missed: refetch through REST

_QUEUE_SIZE = 256
_IDLE_PING_S = 15.0
_READY_TIMEOUT_S = 5.0


class RealtimeUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class Ticket:
    user_id: uuid.UUID
    session_id: uuid.UUID


class RealtimeHub:
    def __init__(self, redis: Redis, prefix: str) -> None:
        self._redis = redis
        self._prefix = f"{prefix}:rt"
        self.channel = f"{self._prefix}:events"
        self._local: dict[uuid.UUID, set[asyncio.Queue[Any]]] = defaultdict(set)
        self._reader: asyncio.Task[None] | None = None
        self._ready: asyncio.Event | None = None
        self._pubsub: PubSub | None = None
        self._lock = asyncio.Lock()

    # --- tickets -----------------------------------------------------------------------

    def _ticket_key(self, ticket: str) -> str:
        return f"{self._prefix}:ticket:{hashlib.sha256(ticket.encode()).hexdigest()}"

    async def issue_ticket(self, user_id: uuid.UUID, session_id: uuid.UUID, ttl_s: int) -> str:
        ticket = secrets.token_urlsafe(32)
        await self._redis.set(self._ticket_key(ticket), f"{user_id}:{session_id}", ex=ttl_s)
        return ticket

    async def redeem_ticket(self, ticket: str) -> Ticket | None:
        """Single use: the first redemption deletes it."""
        if not ticket or len(ticket) > 128:
            return None
        raw = await self._redis.getdel(self._ticket_key(ticket))
        if raw is None:
            return None
        user_id, _, session_id = (raw.decode() if isinstance(raw, bytes) else str(raw)).partition(":")
        return Ticket(user_id=uuid.UUID(user_id), session_id=uuid.UUID(session_id))

    # --- connection slots --------------------------------------------------------------

    def _slots_key(self, user_id: uuid.UUID) -> str:
        return f"{self._prefix}:conns:{user_id}"

    async def claim_slot(self, user_id: uuid.UUID, conn_id: str, ttl_s: float, limit: int) -> bool:
        """Add the connection, then check the count; over the cap, give the slot back."""
        key, now = self._slots_key(user_id), time.time()
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, "-inf", now)
            pipe.zadd(key, {conn_id: now + ttl_s})
            pipe.zcard(key)
            pipe.expire(key, int(ttl_s) + 1)
            _, _, count, _ = await pipe.execute()
        if int(count) > limit:
            await self._redis.zrem(key, conn_id)
            return False
        return True

    async def refresh_slot(self, user_id: uuid.UUID, conn_id: str, ttl_s: float) -> None:
        key = self._slots_key(user_id)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zadd(key, {conn_id: time.time() + ttl_s})
            pipe.expire(key, int(ttl_s) + 1)
            await pipe.execute()

    async def release_slot(self, user_id: uuid.UUID, conn_id: str) -> None:
        with contextlib.suppress(RedisError, OSError):
            await self._redis.zrem(self._slots_key(user_id), conn_id)

    # --- publishing --------------------------------------------------------------------

    async def publish(self, to: Iterable[uuid.UUID], event: dict[str, Any]) -> None:
        """Best effort, after the commit: a lost hint costs the client a refresh."""
        payload = json.dumps({"to": sorted({str(u) for u in to}), "event": event})
        try:
            await self._redis.publish(self.channel, payload)
        except (RedisError, OSError) as exc:
            logger.warning(
                "realtime publish failed",
                extra={"event": "realtime.publish_failed", "error_type": type(exc).__name__},
            )

    async def revoke(self, user_id: uuid.UUID, session_id: uuid.UUID | None = None) -> None:
        """Close the member's connections for one session, or all (None)."""
        await self.publish(
            [user_id], {"type": "session.revoked", "session_id": str(session_id) if session_id else None}
        )

    # --- subscribing -------------------------------------------------------------------

    @contextlib.asynccontextmanager
    async def subscribe(self, user_id: uuid.UUID) -> AsyncIterator[asyncio.Queue[Any]]:
        """A queue of this member's events, live once this returns."""
        await self._ensure_started()
        queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=_QUEUE_SIZE)
        self._local[user_id].add(queue)
        try:
            yield queue
        finally:
            queues = self._local.get(user_id)
            if queues is not None:
                queues.discard(queue)
                if not queues:
                    del self._local[user_id]

    async def _ensure_started(self) -> None:
        async with self._lock:
            if self._reader is None or self._reader.done():
                pubsub = self._redis.pubsub()
                try:
                    await pubsub.subscribe(self.channel)
                except (RedisError, OSError) as exc:
                    await pubsub.aclose()  # type: ignore[no-untyped-call]
                    raise RealtimeUnavailableError("cannot subscribe") from exc
                self._ready = asyncio.Event()
                self._pubsub = pubsub
                self._reader = asyncio.create_task(self._run(pubsub, self._ready), name="realtime-reader")
            ready = self._ready
        if ready is None:
            raise RealtimeUnavailableError("not started")
        try:
            await asyncio.wait_for(ready.wait(), timeout=_READY_TIMEOUT_S)
        except TimeoutError as exc:
            raise RealtimeUnavailableError("subscription not confirmed") from exc

    def _deliver(self, queue: asyncio.Queue[Any], item: Any) -> None:
        try:
            queue.put_nowait(item)
        except asyncio.QueueFull:
            # A connection this far behind is closed; the client catches up on reconnect.
            while not queue.empty():
                queue.get_nowait()
            queue.put_nowait(CLOSE)

    def _broadcast_local(self, item: Any) -> None:
        for queues in list(self._local.values()):
            for queue in list(queues):
                self._deliver(queue, item)

    async def _run(self, pubsub: PubSub, ready: asyncio.Event) -> None:
        try:
            while True:
                message = await pubsub.get_message(timeout=_IDLE_PING_S)
                if message is None:
                    await pubsub.ping()  # a dead connection fails here instead of hanging
                    continue
                kind = message["type"]
                if kind == "subscribe":
                    if ready.is_set():
                        # The client reconnected and resubscribed: anything published in between is lost.
                        self._broadcast_local(RESYNC)
                    ready.set()
                elif kind == "message":
                    payload = json.loads(message["data"])
                    event = payload["event"]
                    for raw in payload["to"]:
                        for queue in list(self._local.get(uuid.UUID(raw), ())):
                            self._deliver(queue, event)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(
                "realtime subscription failed",
                extra={"event": "realtime.subscription_failed", "error_type": type(exc).__name__},
            )
        finally:
            self._broadcast_local(CLOSE)
            with contextlib.suppress(Exception):
                await asyncio.shield(pubsub.aclose())  # type: ignore[no-untyped-call]

    async def aclose(self) -> None:
        reader, self._reader = self._reader, None
        if reader is not None and not reader.done():
            reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reader
