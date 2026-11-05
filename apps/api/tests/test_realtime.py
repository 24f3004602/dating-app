"""F05 realtime over a real uvicorn server and WebSocket client: tickets
(F05-N2), hints across API processes, reconnection with REST catch-up
(F05-E2), sign-out and revocation (T03), blocks (T08), caps, heartbeats,
lost subscriptions, and logs (T19)."""

from __future__ import annotations

import asyncio
import dataclasses
import io
import json
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.main import create_app
from app.modules.accounts.models import User
from app.modules.auth.crypto import new_session_token
from app.modules.auth.models import Session, SessionClient
from app.modules.auth.service import local_today
from app.modules.discovery.models import Block, DailyPick
from tests.chat import Db, LiveServer, connected, event, history, nothing, pair, send, socket, ticket
from tests.conftest import close_app
from tests.members import Member, add, make_member
from tests.support import FrozenClock


@pytest.fixture
async def live(app: FastAPI) -> AsyncIterator[LiveServer]:
    async with LiveServer(app) as server:
        yield server


@pytest.fixture
async def elsewhere(app: FastAPI, db: Db, clock: FrozenClock) -> AsyncIterator[AsyncClient]:
    """A second API process: its own app and Redis client, the same Redis
    namespace and database."""
    second = create_app(app.state.settings, configure_logs=False)
    second.state.session_factory = db
    second.state.auth = dataclasses.replace(second.state.auth, clock=clock)
    async with AsyncClient(transport=ASGITransport(app=second), base_url="http://testserver") as c:
        yield c
    await close_app(second)


def tune(app: FastAPI, **settings: Any) -> None:
    app.state.settings = app.state.settings.model_copy(update=settings)


async def closed_with(ws: Any, wait: float = 3.0) -> int:
    """The close code the server sends within `wait` seconds (pings ignored)."""

    async def drain() -> None:
        while True:
            await ws.recv()

    with pytest.raises(ConnectionClosed) as closed:
        await asyncio.wait_for(drain(), wait)
    assert closed.value.rcvd is not None
    return int(closed.value.rcvd.code)


async def another_session(db: Db, who: Member, now: datetime) -> Member:
    """The same member signed in on a second device."""
    token, digest = new_session_token()
    async with db() as s:
        s.add(Session(user_id=who.id, token_hash=digest, client=SessionClient.mobile,
                      created_at=now, expires_at=now + timedelta(days=30), last_used_at=now))  # fmt: skip
        await s.commit()
    return Member(id=who.id, token=token, photo_ids=[])


# --- delivery ------------------------------------------------------------------------


async def test_hints_reach_both_people_across_processes(
    app: FastAPI, client: AsyncClient, *, elsewhere: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, clock())
    async with connected(live, client, asha) as asha_ws, connected(live, client, ravi) as ravi_ws:
        sent = await send(elsewhere, ravi, match_id, "Hi Asha, chai this weekend?")
        assert sent.status_code == 201
        hint = {"type": "message.created", "match_id": str(match_id), "n": 1}
        assert await event(asha_ws) == hint  # IDs only: no text passes through Redis
        assert await event(ravi_ws) == hint  # the sender's other devices
        assert (await history(client, asha, match_id)).json()["items"][0]["body"] == "Hi Asha, chai this weekend?"

        r = await elsewhere.post(f"/v1/matches/{match_id}/read", json={"up_to_n": 1}, headers=asha.headers)
        assert r.status_code == 200
        assert await event(asha_ws) == {"type": "read.updated", "match_id": str(match_id), "last_read_n": 1}
        assert await nothing(ravi_ws)  # no read receipts


async def test_a_mutual_like_tells_both(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    now = clock()
    asha = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",))
    ravi = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",))
    await add(db, DailyPick(viewer_id=asha.id, pick_date=local_today(app.state.settings, now), candidate_id=ravi.id,
                            rank=1, distance_bucket="under_5_km", created_at=now))  # fmt: skip
    async with connected(live, client, asha) as asha_ws, connected(live, client, ravi) as ravi_ws:
        first = await client.post("/v1/interactions", json={"target_id": str(ravi.id), "kind": "like"},
                                  headers=asha.headers)  # fmt: skip
        assert first.json()["match"] is None
        assert await nothing(asha_ws)
        assert await nothing(ravi_ws)  # a like alone is not announced
        back = await client.post("/v1/interactions", json={"target_id": str(asha.id), "kind": "like"},
                                 headers=ravi.headers)  # fmt: skip
        match_id = back.json()["match"]["id"]
        assert await event(asha_ws) == {"type": "match.created", "match_id": match_id}
        assert await event(ravi_ws) == {"type": "match.created", "match_id": match_id}


async def test_reconnect_then_catch_up_loses_nothing(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        await send(client, ravi, match_id, "one")
        assert (await event(ws))["n"] == 1
    seen = 1
    for body in ("two", "three"):  # sent while Asha is offline
        assert (await send(client, ravi, match_id, body)).status_code == 201
    async with connected(live, client, asha) as ws:
        # `ready` first, then catch up through REST from the last number seen.
        caught = (await history(client, asha, match_id, after=seen)).json()["items"]
        assert [m["body"] for m in caught] == ["two", "three"]
        seen = caught[-1]["n"]
        await send(client, ravi, match_id, "four")
        assert await event(ws) == {"type": "message.created", "match_id": str(match_id), "n": seen + 1}
    assert [m["n"] for m in (await history(client, asha, match_id)).json()["items"]] == [1, 2, 3, 4]


async def test_blocks_stop_hints_with_the_messages(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        await add(db, Block(blocker_id=asha.id, blocked_id=ravi.id))
        assert (await send(client, ravi, match_id, "are you there?")).status_code == 404
        assert await nothing(ws)


# --- tickets (F05-N2) ---------------------------------------------------------------


async def _refused(live: LiveServer, value: str) -> None:
    with pytest.raises(InvalidStatus) as refused:
        async with socket(live, value):
            pass
    assert refused.value.response.status_code == 403


async def test_tickets_are_single_use_short_lived_and_bound_to_a_live_session(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, _ravi, _ = await pair(app, db, clock())
    assert (await client.post("/v1/realtime/ticket")).status_code == 401

    r = await client.post("/v1/realtime/ticket", headers=asha.headers)
    assert r.status_code == 201
    assert r.json()["expires_in"] == 30
    used = r.json()["ticket"]
    async with socket(live, used) as ws:
        assert await event(ws) == {"type": "ready"}
    await _refused(live, used)  # single use

    expired = await ticket(client, asha)
    hub = app.state.realtime
    assert await app.state.redis.pexpire(hub._ticket_key(expired), 1)
    await asyncio.sleep(0.05)
    await _refused(live, expired)

    await _refused(live, "")
    await _refused(live, "x" * 43)
    await _refused(live, "y" * 500)

    revoked = await ticket(client, asha)
    assert (await client.post("/v1/auth/logout", headers=asha.headers)).status_code == 204
    await _refused(live, revoked)  # the session behind it has ended


# --- ending connections ------------------------------------------------------------------


async def test_signing_out_closes_that_sessions_connections(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, _ravi, _ = await pair(app, db, clock())
    laptop = await another_session(db, asha, clock())
    async with connected(live, client, asha) as on_phone, connected(live, client, laptop) as on_laptop:
        assert (await client.post("/v1/auth/logout", headers=asha.headers)).status_code == 204
        assert await closed_with(on_phone) == 4401
        assert await nothing(on_laptop)  # another session: still open
        assert (await client.post("/v1/auth/logout-all", headers=laptop.headers)).status_code == 204
        assert await closed_with(on_laptop) == 4401


@pytest.mark.parametrize("change", ["revoked", "suspended"])
async def test_long_connections_recheck_the_session(
    app: FastAPI, client: AsyncClient, *, db: Db, clock: FrozenClock, live: LiveServer, change: str
) -> None:
    tune(app, realtime_revalidate_s=0.3)
    asha, _ravi, _ = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        async with db() as s:  # changed without any realtime event (another tool, a moderator)
            if change == "revoked":
                await s.execute(update(Session).where(Session.user_id == asha.id).values(revoked_at=clock()))
            else:
                await s.execute(update(User).where(User.id == asha.id).values(status="suspended"))
            await s.commit()
        assert await closed_with(ws) == 4401


async def test_heartbeats_and_the_connection_cap(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    tune(app, realtime_heartbeat_s=0.2, realtime_max_connections=2)
    asha, _ravi, _ = await pair(app, db, clock())
    async with connected(live, client, asha) as first:
        assert await event(first, skip_pings=False) == {"type": "ping"}
        second_ticket = await ticket(client, asha)
        async with connected(live, client, asha), socket(live, second_ticket) as third:
            assert await closed_with(third) == 4429
        async with connected(live, client, asha) as again:  # a slot was freed
            assert await event(again, skip_pings=False) == {"type": "ping"}


async def test_a_flooding_client_is_closed(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    asha, _ravi, _ = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        for _ in range(40):
            await ws.send("{}")
        assert await closed_with(ws) == 1008


async def test_a_lost_subscription_closes_clients_then_recovers(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    """Redis drops the subscriber connection: hints published meanwhile are
    lost, so clients are closed with 1012, reconnect and catch up; the next
    connection resubscribes and live delivery works again."""
    asha, ravi, match_id = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        await app.state.redis.execute_command("CLIENT", "KILL", "TYPE", "pubsub")
        assert await closed_with(ws, 20.0) == 1012
    async with connected(live, client, asha) as ws:
        await send(client, ravi, match_id, "after the blip")
        assert (await event(ws))["type"] == "message.created"


async def test_a_resubscription_tells_clients_to_resync(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, live: LiveServer
) -> None:
    """If the Redis client reconnects and resubscribes on its own, Redis
    confirms the subscription again: the hub treats that as a possible gap."""
    asha, ravi, match_id = await pair(app, db, clock())
    async with connected(live, client, asha) as ws:
        hub = app.state.realtime
        await hub._pubsub.subscribe(hub.channel)  # what redis-py does after a transparent reconnect
        assert await event(ws) == {"type": "resync"}
        await send(client, ravi, match_id, "still live")
        assert (await event(ws))["type"] == "message.created"


async def test_tickets_and_addresses_stay_out_of_logs(
    app: FastAPI, client: AsyncClient, *, db: Db, clock: FrozenClock, live: LiveServer, captured_logs: io.StringIO
) -> None:
    asha, _ravi, _ = await pair(app, db, clock())
    value = await ticket(client, asha)
    async with socket(live, value) as ws:
        assert await event(ws) == {"type": "ready"}
    await asyncio.sleep(0.1)
    output = captured_logs.getvalue()
    assert value not in output  # anywhere, the test's own client library included
    # The server side: our record only, no address and no query string.
    server = [r for r in map(json.loads, output.splitlines()) if not r["logger"].startswith("websockets.client")]
    assert any(r.get("event") == "realtime.closed" for r in server)
    text = json.dumps(server)
    assert "?ticket" not in text  # the query string; the route name /v1/realtime/ticket is fine
    assert "127.0.0.1" not in text
