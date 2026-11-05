"""Helpers for the messaging and realtime tests."""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import pytest
import uvicorn
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

from app.cli import server_config
from app.modules.discovery.models import Match
from app.modules.matching.service import ordered
from tests.members import Member, add, make_member

Db = async_sessionmaker[AsyncSession]


async def pair(app: FastAPI, db: Db, now: datetime, **kw: Any) -> tuple[Member, Member, uuid.UUID]:
    """Two members with an open match (created directly; matching has its own tests)."""
    asha = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",), name="Asha", **kw)
    ravi = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",), name="Ravi", **kw)
    return asha, ravi, await match_between(db, asha, ravi, now)


async def match_between(db: Db, x: Member, y: Member, now: datetime) -> uuid.UUID:
    a, b = ordered(x.id, y.id)
    match = Match(user_a_id=a, user_b_id=b, created_at=now)
    await add(db, match)
    return match.id


async def send(
    client: AsyncClient, who: Member, match_id: uuid.UUID, body: str, cmid: uuid.UUID | None = None
) -> Response:
    return await client.post(
        f"/v1/matches/{match_id}/messages",
        json={"client_message_id": str(cmid or uuid.uuid4()), "body": body},
        headers=who.headers,
    )


async def history(client: AsyncClient, who: Member, match_id: uuid.UUID, **params: Any) -> Response:
    return await client.get(f"/v1/matches/{match_id}/messages", params=params, headers=who.headers)


class LiveServer:
    """The app served by real uvicorn (the production settings) on this event loop."""

    def __init__(self, app: FastAPI) -> None:
        self.server = uvicorn.Server(server_config(app, host="127.0.0.1", port=0, lifespan="off"))
        self.task: asyncio.Task[None] | None = None

    async def __aenter__(self) -> LiveServer:
        self.task = asyncio.create_task(self.server.serve())
        while not self.server.started:
            if self.task.done():
                self.task.result()
            await asyncio.sleep(0.01)
        return self

    async def __aexit__(self, *exc: object) -> None:
        self.server.should_exit = True
        if self.task is not None:
            await self.task

    @property
    def port(self) -> int:
        return int(self.server.servers[0].sockets[0].getsockname()[1])

    def url(self, ticket: str) -> str:
        return f"ws://127.0.0.1:{self.port}/v1/realtime?ticket={ticket}"


async def ticket(client: AsyncClient, who: Member) -> str:
    r = await client.post("/v1/realtime/ticket", headers=who.headers)
    assert r.status_code == 201, r.text
    return str(r.json()["ticket"])


@contextlib.asynccontextmanager
async def socket(live: LiveServer, value: str) -> AsyncIterator[ClientConnection]:
    async with connect(live.url(value), proxy=None, open_timeout=5) as ws:
        yield ws


@contextlib.asynccontextmanager
async def connected(live: LiveServer, client: AsyncClient, who: Member) -> AsyncIterator[ClientConnection]:
    """A realtime connection that has said `ready`."""
    async with socket(live, await ticket(client, who)) as ws:
        assert await event(ws) == {"type": "ready"}
        yield ws


async def event(ws: ClientConnection, wait: float = 3.0, *, skip_pings: bool = True) -> dict[str, Any]:
    while True:
        raw = await asyncio.wait_for(ws.recv(), wait)
        data: dict[str, Any] = json.loads(raw)
        if skip_pings and data.get("type") == "ping":
            continue
        return data


async def nothing(ws: ClientConnection, wait: float = 0.5) -> bool:
    """True if no event (other than pings) arrives within `wait` seconds."""
    try:
        await event(ws, wait)
    except TimeoutError:
        return True
    return False


async def closed_with(ws: Any, wait: float = 3.0) -> int:
    """The close code the server sends within `wait` seconds (pings ignored)."""

    async def drain() -> None:
        while True:
            await ws.recv()

    with pytest.raises(ConnectionClosed) as closed:
        await asyncio.wait_for(drain(), wait)
    assert closed.value.rcvd is not None
    return int(closed.value.rcvd.code)
