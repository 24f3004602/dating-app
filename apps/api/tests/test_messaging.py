"""F05 messaging over REST: sending, history, read pointers and unread counts,
idempotency, who may read and send (T05, T08, T14), the nudge list, the
your-turn cap (D073), and concurrency on a committed database."""

from __future__ import annotations

import asyncio
import io
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta
from typing import Any

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select, update

from app.config import Settings
from app.main import create_app
from app.modules.accounts.models import User
from app.modules.auth.service import local_today
from app.modules.discovery.models import Block, DailyPick, Match
from app.modules.matching.service import chats_awaiting_reply
from app.modules.messaging import nudge
from app.modules.messaging.models import Message, MessageFlag
from tests.chat import Db, history, match_between, pair, send
from tests.conftest import alembic_config, close_app, drop_database, recreate_database, with_database
from tests.members import Member, add, make_member
from tests.support import FrozenClock


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")  # 14:30 in India
    return clock.now


async def matches(client: AsyncClient, who: Member) -> list[dict[str, Any]]:
    r = await client.get("/v1/matches", headers=who.headers)
    assert r.status_code == 200
    out: list[dict[str, Any]] = r.json()
    return out


async def read(client: AsyncClient, who: Member, match_id: uuid.UUID, n: int) -> Any:
    return await client.post(f"/v1/matches/{match_id}/read", json={"up_to_n": n}, headers=who.headers)


# --- send, receive, paginate, read (F05-H1) -----------------------------------------


async def test_send_receive_and_unread_counts(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    cmid = uuid.uuid4()
    sent = await send(client, asha, match_id, "  Hi Ravi! Loved your answer about chai.  ", cmid)
    assert sent.status_code == 201, sent.text
    body = sent.json()
    assert body["n"] == 1
    assert body["from_me"] is True
    assert body["body"] == "Hi Ravi! Loved your answer about chai."  # trimmed
    assert body["client_message_id"] == str(cmid)

    theirs = (await history(client, ravi, match_id)).json()
    assert [(m["n"], m["from_me"], m["client_message_id"]) for m in theirs["items"]] == [(1, False, None)]
    assert theirs["has_more"] is False

    (for_ravi,) = await matches(client, ravi)
    assert for_ravi["unread"] == 1
    assert for_ravi["your_turn"] is True
    assert for_ravi["last_message"]["preview"] == "Hi Ravi! Loved your answer about chai."
    assert for_ravi["last_message"]["from_me"] is False
    (for_asha,) = await matches(client, asha)
    assert (for_asha["unread"], for_asha["your_turn"], for_asha["last_message"]["from_me"]) == (0, False, True)

    r = await read(client, ravi, match_id, 1)
    assert r.status_code == 200
    assert r.json() == {"last_read_n": 1, "unread": 0}
    assert (await read(client, ravi, match_id, 0)).json()["last_read_n"] == 1  # never moves back
    assert (await read(client, ravi, match_id, 99)).json()["last_read_n"] == 1  # clamped to the latest

    assert (await send(client, ravi, match_id, "Hey Asha")).status_code == 201
    (for_ravi,) = await matches(client, ravi)
    assert (for_ravi["unread"], for_ravi["your_turn"]) == (0, False)
    (for_asha,) = await matches(client, asha)
    assert (for_asha["unread"], for_asha["your_turn"]) == (1, True)
    one = (await client.get(f"/v1/matches/{match_id}", headers=asha.headers)).json()
    assert one == for_asha


async def test_history_pages_in_both_directions(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    for i in range(8):
        assert (await send(client, asha if i % 2 == 0 else ravi, match_id, f"message {i + 1}")).status_code == 201

    def ns(r: Any) -> tuple[list[int], bool]:
        return [m["n"] for m in r.json()["items"]], r.json()["has_more"]

    assert ns(await history(client, asha, match_id, limit=3)) == ([6, 7, 8], True)
    assert ns(await history(client, asha, match_id, limit=3, before=6)) == ([3, 4, 5], True)
    assert ns(await history(client, asha, match_id, limit=3, before=3)) == ([1, 2], False)
    assert ns(await history(client, asha, match_id, after=5)) == ([6, 7, 8], False)
    assert ns(await history(client, asha, match_id, after=0, limit=2)) == ([1, 2], True)
    assert ns(await history(client, asha, match_id, after=8)) == ([], False)
    page = (await history(client, ravi, match_id, after=6)).json()["items"]
    assert [(m["body"], m["from_me"]) for m in page] == [("message 7", False), ("message 8", True)]

    both = await history(client, asha, match_id, before=5, after=2)
    assert both.status_code == 422
    assert both.json()["code"] == "invalid_cursor"
    for bad in ({"limit": 0}, {"limit": 51}, {"before": 0}, {"after": -1}):
        assert (await history(client, asha, match_id, **bad)).status_code == 422, bad


async def test_matches_are_ordered_by_latest_activity(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    asha, ravi, first = await pair(app, db, now)
    kabir = await make_member(db, app.state.storage, now, name="Kabir")
    second = await match_between(db, asha, kabir, now + timedelta(minutes=1))
    assert [m["id"] for m in await matches(client, asha)] == [str(second), str(first)]
    clock.advance(minutes=2)
    assert (await send(client, ravi, first, "Still there?")).status_code == 201
    assert [m["id"] for m in await matches(client, asha)] == [str(first), str(second)]


# --- idempotency (F05-E1, T14) ------------------------------------------------------


async def test_a_retry_returns_the_stored_message(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    cmid = uuid.uuid4()
    first = await send(client, asha, match_id, "Hello", cmid)
    again = await send(client, asha, match_id, "Hello", cmid)
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json() == first.json()  # read back from the database: the same, in UTC
    assert again.json()["sent_at"].endswith("Z")
    conflict = await send(client, asha, match_id, "Something else", cmid)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "idempotency_conflict"
    # The same ID from the other person is their own message.
    assert (await send(client, ravi, match_id, "Hello", cmid)).status_code == 201
    async with db() as s:
        stored = (await s.execute(select(Message.n, Message.sender_id).order_by(Message.n))).all()
    assert stored == [(1, asha.id), (2, ravi.id)]


# --- who may read and send (F05-N1, T05, T08) -------------------------------------------


async def _refused(client: AsyncClient, who: Member, match_id: uuid.UUID) -> None:
    for r in (
        await send(client, who, match_id, "hello?"),
        await history(client, who, match_id),
        await read(client, who, match_id, 1),
        await client.get(f"/v1/matches/{match_id}", headers=who.headers),
    ):
        assert r.status_code == 404, r.text
        assert r.json()["code"] == "not_found"


async def test_strangers_and_unknown_matches_get_404(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, _ravi, match_id = await pair(app, db, now)
    assert (await send(client, asha, match_id, "Hi")).status_code == 201
    kabir = await make_member(db, app.state.storage, now)
    await _refused(client, kabir, match_id)
    await _refused(client, asha, uuid.uuid4())
    assert (await client.get(f"/v1/matches/{match_id}/messages")).status_code == 401


@pytest.mark.parametrize("change", ["closed", "blocked_by_me", "blocked_me", "suspended", "leaving"])
async def test_stale_or_blocked_matches_refuse_everything(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, change: str
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    assert (await send(client, ravi, match_id, "Hi Asha")).status_code == 201
    async with db() as s:
        if change == "closed":
            await s.execute(update(Match).values(closed_at=now, closed_reason="unmatched"))
        elif change == "blocked_by_me":
            s.add(Block(blocker_id=asha.id, blocked_id=ravi.id))
        elif change == "blocked_me":
            s.add(Block(blocker_id=ravi.id, blocked_id=asha.id))
        elif change == "suspended":
            await s.execute(update(User).where(User.id == ravi.id).values(status="suspended"))
        else:
            await s.execute(update(User).where(User.id == ravi.id).values(deletion_requested_at=now))
        await s.commit()
    await _refused(client, asha, match_id)
    assert await matches(client, asha) == []
    async with db() as s:
        assert (await s.execute(select(func.count()).select_from(Message))).scalar_one() == 1


async def test_message_bodies_are_validated(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, _ravi, match_id = await pair(app, db, now)
    url = f"/v1/matches/{match_id}/messages"
    for payload in (
        {"client_message_id": str(uuid.uuid4()), "body": ""},
        {"client_message_id": str(uuid.uuid4()), "body": "   \n  "},
        {"client_message_id": str(uuid.uuid4()), "body": "x" * 2001},
        {"client_message_id": str(uuid.uuid4()), "body": "bell \u0007"},
        {"client_message_id": str(uuid.uuid4()), "body": "hidden \u202e text"},
        {"client_message_id": "not-a-uuid", "body": "hello"},
        {"body": "hello"},
        {"client_message_id": str(uuid.uuid4()), "body": "hello", "sender_id": str(uuid.uuid4())},
    ):
        r = await client.post(url, json=payload, headers=asha.headers)
        assert r.status_code == 422, payload
    ok = await send(client, asha, match_id, "नमस्ते \u200d" + "y" * 1990)  # Indic joiners are allowed
    assert ok.status_code == 201


async def test_sending_is_rate_limited(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, _ravi, match_id = await pair(app, db, now)
    statuses = [(await send(client, asha, match_id, f"m{i}")).status_code for i in range(31)]
    assert statuses[:30] == [201] * 30
    assert statuses[30] == 429


async def test_message_text_stays_out_of_logs(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, captured_logs: io.StringIO
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    secret = "my number is nine eight seven, call me at the Saket metro"
    await send(client, asha, match_id, secret)
    await history(client, ravi, match_id)
    output = captured_logs.getvalue()
    assert "http.request" in output
    assert "Saket metro" not in output
    assert "nine eight seven" not in output


# --- nudge terms (D075) ---------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("You are such an IDIOT!", MessageFlag.hurtful),
        ("ＩＤＩＯＴ", MessageFlag.hurtful),  # noqa: RUF001 - "IDIOT" in fullwidth letters, NFKC
        ("just shut   up.", MessageFlag.hurtful),  # a phrase across spacing
        ("Send me your UPI id?", MessageFlag.money),
        ("can you transfer money to my account", MessageFlag.money),
        ("idiot, send money", MessageFlag.hurtful),  # hurtful wins
        ("Skyscrapers in Gurgaon", None),  # "kys" only as a word
        ("shutup", None),  # whole words only
        ("I love chai and long walks", None),
        ("नमस्ते दोस्त", None),
    ],
)
def test_nudge_flags(text: str, expected: MessageFlag | None) -> None:
    assert nudge.flag(text) is expected


def test_nudge_words_keep_indic_vowel_signs() -> None:
    assert nudge.words("नमस्ते, दोस्त!") == ["नमस्ते", "दोस्त"]


async def test_nudge_terms_and_safety_tips(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    r = await client.get("/v1/safety/nudge-terms", headers=asha.headers)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "private, max-age=3600"
    assert "idiot" in r.json()["hurtful"]
    assert "upi" in r.json()["money"]
    assert (await client.get("/v1/safety/nudge-terms")).status_code == 401

    sent = await send(client, ravi, match_id, "Please send money on my UPI, urgent")
    assert sent.status_code == 201  # a nudge never blocks
    assert sent.json()["safety_tip"] is None  # the tip is for the recipient
    (received,) = (await history(client, asha, match_id)).json()["items"]
    assert received["safety_tip"] == "money"
    async with db() as s:
        assert (await s.execute(select(Message.flag))).scalar_one() is MessageFlag.money


# --- the your-turn cap (D073) ---------------------------------------------------------


async def test_likes_pause_while_chats_await_your_reply(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    settings = app.state.settings
    asha = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",))
    others = [await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",)) for _ in range(5)]
    match_ids = [await match_between(db, asha, o, now) for o in others]
    for other, match_id in zip(others, match_ids, strict=True):
        assert (await send(client, other, match_id, "Hi Asha!")).status_code == 201
    new = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",))
    later = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",))
    day = local_today(settings, now)
    picks = (new, later)
    await add(db, *(DailyPick(viewer_id=asha.id, pick_date=day, candidate_id=c.id, rank=i + 1,
                              distance_bucket="under_5_km", created_at=now) for i, c in enumerate(picks)))  # fmt: skip

    def like(target: Member) -> Any:
        return client.post("/v1/interactions", json={"target_id": str(target.id), "kind": "like"}, headers=asha.headers)

    capped = await like(new)
    assert capped.status_code == 409
    assert capped.json()["code"] == "your_turn_limit"
    assert capped.json()["waiting"] == 5
    assert sum(m["your_turn"] for m in await matches(client, asha)) == 5
    passing = await client.post(
        "/v1/interactions", json={"target_id": str(later.id), "kind": "pass"}, headers=asha.headers
    )
    assert passing.status_code == 201  # passes are never capped

    assert (await send(client, asha, match_ids[0], "Hi! Sorry for the wait.")).status_code == 201
    assert (await like(new)).status_code == 201


async def test_the_cap_ignores_old_and_blocked_chats(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    settings = app.state.settings
    asha = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",))
    others = [await make_member(db, app.state.storage, now) for _ in range(3)]
    match_ids = [await match_between(db, asha, o, now) for o in others]
    for other, match_id in zip(others, match_ids, strict=True):
        await send(client, other, match_id, "Hello")
    async with db() as s:
        assert await chats_awaiting_reply(s, settings, asha.id, now) == 3
        s.add(Block(blocker_id=asha.id, blocked_id=others[0].id))
        await s.commit()
        assert await chats_awaiting_reply(s, settings, asha.id, now) == 2
        later = now + timedelta(days=settings.your_turn_window_days, seconds=1)
        assert await chats_awaiting_reply(s, settings, asha.id, later) == 0
    clock.now = now + timedelta(days=settings.your_turn_window_days, seconds=1)
    assert not any(m["your_turn"] for m in await matches(client, asha))


# --- concurrency on a committed database ------------------------------------------


@pytest.fixture
def scratch_settings(base_settings: Settings) -> Iterator[Settings]:
    assert base_settings.migrations_database_url is not None
    owner = base_settings.migrations_database_url.get_secret_value()
    name = "datingapp_messaging_test"
    recreate_database(owner, name)
    command.upgrade(alembic_config(with_database(owner, name), base_settings.db_runtime_role), "head")
    yield base_settings.model_copy(
        update={
            "app_env": "test",
            "database_url": SecretStr(with_database(base_settings.database_url.get_secret_value(), name)),
            "migrations_database_url": SecretStr(with_database(owner, name)),
            "password_hash_profile": "test",
            "email_backend": "memory",
            "storage_backend": "memory",
            "rate_limit_prefix": f"rl-test-{uuid.uuid4().hex[:12]}",
            "db_pool_size": 10,
        }
    )
    drop_database(owner, name)


@pytest.fixture
async def committed(scratch_settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(scratch_settings, configure_logs=False)
    yield application
    keys = [k async for k in application.state.redis.scan_iter(match=f"{scratch_settings.rate_limit_prefix}:*")]
    if keys:
        await application.state.redis.delete(*keys)
    await close_app(application)


SENDS_EACH = 14  # 28 requests each with the double taps: under the 30-a-minute burst limit


async def test_concurrent_sends_get_gap_free_numbers_and_catch_up_misses_nothing(committed: FastAPI) -> None:
    """MSG-C1: both people send at once, every message is sent twice (a double
    tap), and a reader polls `after=` while they do. Numbers are 1..N with no
    gap or duplicate, each message is stored once, and the reader never sees
    a number before an earlier one has committed."""
    db: Db = committed.state.session_factory
    now = datetime.now().astimezone()
    asha, ravi, match_id = await pair(committed, db, now)
    seen: list[int] = []
    done = asyncio.Event()

    async with AsyncClient(transport=ASGITransport(app=committed), base_url="http://testserver") as c:

        async def sender(who: Member) -> None:
            for i in range(SENDS_EACH):
                cmid = uuid.uuid4()
                a, b = await asyncio.gather(*(send(c, who, match_id, f"m{i}", cmid) for _ in range(2)))
                assert sorted((a.status_code, b.status_code)) == [200, 201]
                assert a.json()["id"] == b.json()["id"]

        async def reader() -> None:
            cursor = 0
            while True:
                finished = done.is_set()
                page = (await history(c, asha, match_id, after=cursor, limit=50)).json()["items"]
                for m in page:
                    assert m["n"] == cursor + 1, f"saw {m['n']} after {cursor}: a gap"
                    cursor = m["n"]
                    seen.append(cursor)
                if finished and not page:
                    return
                await asyncio.sleep(0)

        poll = asyncio.create_task(reader())
        try:
            await asyncio.gather(sender(asha), sender(ravi))
        finally:
            done.set()
            await poll

    total = 2 * SENDS_EACH
    assert seen == list(range(1, total + 1))
    async with db() as s:
        rows = (await s.execute(select(Message.n).where(Message.match_id == match_id).order_by(Message.n))).scalars()
        assert list(rows) == list(range(1, total + 1))
        match = await s.get(Match, match_id)
        assert match is not None
        assert match.last_message_n == total
