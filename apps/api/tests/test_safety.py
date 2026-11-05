"""F06 safety for members: blocking (enforced on every path, T08), unmatching,
reporting with a visible status, and the block-against-send race."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, text

from app.config import Settings
from app.modules.auth.service import local_today
from app.modules.discovery.models import Block, DailyPick, Interaction, InteractionKind, Match
from app.modules.messaging.models import Message
from app.modules.safety.models import Report
from tests.chat import Db, LiveServer, connected, event, history, nothing, pair, send
from tests.conftest import committed_app, scratch_database
from tests.members import Member, add, make_member
from tests.support import FrozenClock


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")
    return clock.now


@pytest.fixture
async def live(app: FastAPI) -> AsyncIterator[LiveServer]:
    async with LiveServer(app) as server:
        yield server


async def count(db: Db, model: type, *where: Any) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())


async def introduce(app: FastAPI, db: Db, now: datetime, viewer: Member, *others: Member) -> None:
    day = local_today(app.state.settings, now)
    await add(db, *(DailyPick(viewer_id=viewer.id, pick_date=day, candidate_id=o.id, rank=i + 1,
                              distance_bucket="under_5_km", created_at=now) for i, o in enumerate(others)))  # fmt: skip


def block(client: AsyncClient, who: Member, target: Member | uuid.UUID) -> Any:
    target_id = target.id if isinstance(target, Member) else target
    return client.post("/v1/blocks", json={"user_id": str(target_id)}, headers=who.headers)


def report(client: AsyncClient, who: Member, subject: Member, **extra: Any) -> Any:
    return client.post(
        "/v1/reports", json={"subject_id": str(subject.id), "reason": "harassment", **extra}, headers=who.headers
    )


# --- blocking (F06-H1) ---------------------------------------------------------------


async def _unreachable(
    client: AsyncClient, viewer: Member, other: Member, match_id: uuid.UUID, *, liked_before: bool = False
) -> None:
    """Every path from `viewer` to `other` is closed. A like made before the
    block can only be replayed (the stored decision, no match: stage 9)."""
    today = (await client.get("/v1/discovery/today", headers=viewer.headers)).json()
    assert str(other.id) not in str(today)
    assert (await client.get(f"/v1/profiles/{other.id}", headers=viewer.headers)).status_code == 404
    for photo_id in other.photo_ids:
        assert (await client.get(f"/v1/media/{photo_id}", headers=viewer.headers)).status_code == 404
    liked = await client.post("/v1/interactions", json={"target_id": str(other.id), "kind": "like"},
                              headers=viewer.headers)  # fmt: skip
    if liked_before:
        assert (liked.status_code, liked.json()["match"]) == (200, None)
    else:
        assert liked.status_code == 404
    assert str(other.id) not in (await client.get("/v1/likes/received", headers=viewer.headers)).text
    assert (await client.get("/v1/matches", headers=viewer.headers)).json() == []
    assert (await client.get(f"/v1/matches/{match_id}", headers=viewer.headers)).status_code == 404
    assert (await send(client, viewer, match_id, "hello?")).status_code == 404
    assert (await history(client, viewer, match_id)).status_code == 404
    read = await client.post(f"/v1/matches/{match_id}/read", json={"up_to_n": 1}, headers=viewer.headers)
    assert read.status_code == 404


async def test_a_block_closes_every_path_both_ways(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    await introduce(app, db, now, asha, ravi)
    await introduce(app, db, now, ravi, asha)
    await add(db, Interaction(actor_id=ravi.id, target_id=asha.id, kind=InteractionKind.like, created_at=now))
    assert (await send(client, ravi, match_id, "Hi Asha")).status_code == 201
    assert (await client.get(f"/v1/profiles/{asha.id}", headers=ravi.headers)).status_code == 200

    async with connected(live, client, asha) as asha_ws, connected(live, client, ravi) as ravi_ws:
        r = await block(client, asha, ravi)
        assert r.status_code == 204
        closed = {"type": "match.closed", "match_id": str(match_id)}  # no reason: a block looks like an unmatch
        assert await event(asha_ws) == closed
        assert await event(ravi_ws) == closed
        await _unreachable(client, ravi, asha, match_id, liked_before=True)
        await _unreachable(client, asha, ravi, match_id)
        assert await nothing(asha_ws)  # Ravi's attempts produced no hints

    async with db() as s:
        match = await s.get(Match, match_id)
        assert match is not None
        assert match.closed_reason == "blocked"
        assert (await s.execute(select(func.count()).select_from(DailyPick))).scalar_one() == 0
    assert (await block(client, asha, ravi)).status_code == 204  # idempotent
    assert await count(db, Block) == 1


async def test_blocking_reveals_nothing_and_unblocking_restores_nothing(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    assert (await block(client, asha, uuid.uuid4())).status_code == 204  # unknown: the same answer
    assert (await block(client, asha, asha)).status_code == 422
    assert await count(db, Block) == 0

    await block(client, asha, ravi)
    listed = (await client.get("/v1/blocks", headers=asha.headers)).json()
    assert [(b["user_id"], b["display_name"]) for b in listed] == [(str(ravi.id), "Ravi")]
    assert (await client.get("/v1/blocks", headers=ravi.headers)).json() == []  # only the blocker sees it

    assert (await client.delete(f"/v1/blocks/{ravi.id}", headers=asha.headers)).status_code == 204
    assert await count(db, Block) == 0
    assert (await client.get(f"/v1/matches/{match_id}", headers=asha.headers)).status_code == 404  # still ended


# --- unmatching ----------------------------------------------------------------------


async def test_either_person_can_unmatch_and_the_chat_closes(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    kabir = await make_member(db, app.state.storage, now)
    await send(client, asha, match_id, "Hi!")
    url = f"/v1/matches/{match_id}/unmatch"
    assert (await client.post(url, headers=kabir.headers)).status_code == 404  # a stranger
    assert (await client.post(f"/v1/matches/{uuid.uuid4()}/unmatch", headers=asha.headers)).status_code == 404
    async with connected(live, client, asha) as asha_ws:
        assert (await client.post(url, headers=ravi.headers)).status_code == 204
        assert await event(asha_ws) == {"type": "match.closed", "match_id": str(match_id)}
    assert (await client.post(url, headers=asha.headers)).status_code == 404  # already ended
    for who in (asha, ravi):
        assert (await history(client, who, match_id)).status_code == 404
        assert (await send(client, who, match_id, "still there?")).status_code == 404
        assert (await client.get("/v1/matches", headers=who.headers)).json() == []
    async with db() as s:
        match = await s.get(Match, match_id)
        assert match is not None
        assert match.closed_reason == "unmatched"


# --- reports (F06-H2) -------------------------------------------------------------------


async def test_reporting_a_message_keeps_a_copy_and_shows_the_status(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    scam = (await send(client, ravi, match_id, "Send 5000 on UPI and I'll visit")).json()
    r = await report(client, asha, ravi, reason="scam", message_id=scam["id"], details="Asked for money twice.")
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["about"], body["status"], body["subject_name"], body["reason"]) == ("message", "open", "Ravi", "scam")
    assert (await history(client, asha, match_id)).status_code == 404  # reporting blocks by default
    mine = (await client.get("/v1/reports/mine", headers=asha.headers)).json()
    assert [m["id"] for m in mine] == [body["id"]]
    assert (await client.get("/v1/reports/mine", headers=ravi.headers)).json() == []  # never the reported person

    # The copy outlives the conversation (purges come in stage 12).
    async with db() as s:
        await s.execute(delete(Message))
        await s.commit()
        row = await s.get(Report, uuid.UUID(body["id"]))
        assert row is not None
        assert row.evidence_text == "Send 5000 on UPI and I'll visit"
        assert (row.priority, row.message_id) == (2, None)


async def test_report_options_and_limits(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    stranger = await make_member(db, app.state.storage, now)
    mine = (await send(client, asha, match_id, "my own message")).json()
    theirs = (await send(client, ravi, match_id, "their message")).json()

    keep = await report(client, asha, ravi, reason="fake", block=False)
    assert keep.status_code == 201
    assert (await history(client, asha, match_id)).status_code == 200  # opted out of blocking
    photo = await report(client, asha, ravi, reason="explicit", photo_id=str(ravi.photo_ids[0]), block=False)
    assert (photo.status_code, photo.json()["about"]) == (201, "photo")

    assert (await report(client, asha, stranger)).status_code == 404  # no connection: no reporting
    assert (await report(client, asha, asha)).status_code == 422
    for bad in (
        {"message_id": mine["id"]},  # my own message
        {"message_id": str(uuid.uuid4())},
        {"photo_id": str(asha.photo_ids[0])},  # not theirs
        {"photo_id": str(ravi.photo_ids[0]), "message_id": theirs["id"]},  # both
        {"details": "x" * 1001},
        {"reason": "boring"},
    ):
        assert (await report(client, asha, ravi, block=False, **bad)).status_code == 422, bad

    # Reporting still works after a block (the connection is the block itself).
    await block(client, asha, ravi)
    assert (await report(client, asha, ravi, message_id=theirs["id"])).status_code == 201
    # 20 a day, counting refused attempts too (8 so far).
    statuses = [(await report(client, asha, ravi, block=False)).status_code for _ in range(13)]
    assert statuses == [201] * 12 + [429]


# --- block against send, on separate connections -------------------------------------


@pytest.fixture
async def committed(base_settings: Settings) -> AsyncIterator[FastAPI]:
    with scratch_database(base_settings, "datingapp_safety_test") as settings:
        async with committed_app(settings) as application:
            yield application


async def test_a_send_waits_for_a_block_in_progress_then_fails(committed: FastAPI) -> None:
    """A block holds the match row lock while it closes the match: a send that
    arrives meanwhile waits on the same lock, re-checks, and is refused.
    Nothing is stored after the block (T08)."""
    db: Db = committed.state.session_factory
    now = datetime.now().astimezone()
    asha, ravi, match_id = await pair(committed, db, now)
    async with AsyncClient(transport=ASGITransport(app=committed), base_url="http://testserver") as c:
        async with db() as blocking:
            await blocking.execute(text("SELECT id FROM matches WHERE id = :id FOR NO KEY UPDATE"), {"id": match_id})
            sending = asyncio.create_task(send(c, ravi, match_id, "sent during the block"))
            await asyncio.sleep(0.5)
            assert not sending.done(), "the send must wait for the lock"
            blocking.add(Block(blocker_id=asha.id, blocked_id=ravi.id, created_at=now))
            await blocking.execute(
                text("UPDATE matches SET closed_at = now(), closed_reason = 'blocked' WHERE id = :id"), {"id": match_id}
            )
            await blocking.commit()
        r = await sending
        assert r.status_code == 404
    assert await count(db, Message) == 0
