"""F04 matching: likes and passes (no undo), atomic mutual matches, the equal
daily like limit, likes received, matches, access (T05, T08, T13)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import datetime
from typing import Any

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.main import create_app
from app.modules.accounts.models import User
from app.modules.auth.service import local_today
from app.modules.discovery.models import Block, DailyPick, Interaction, Match
from app.modules.profiles.models import Profile
from tests.conftest import alembic_config, close_app, drop_database, recreate_database, with_database
from tests.members import Member, add, make_member
from tests.support import FrozenClock

Db = async_sessionmaker[AsyncSession]


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-04T09:00:00+00:00")  # 14:30 in India
    return clock.now


async def woman(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await make_member(db, app.state.storage, now, **{"gender": "woman", "interested_in": ("man",), **kw})


async def man(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await make_member(db, app.state.storage, now, **{"gender": "man", "interested_in": ("woman",), **kw})


async def in_set(db: Db, settings: Settings, now: datetime, viewer: Member, *others: Member) -> None:
    """Put people in the viewer's set for today, as discovery would."""
    day = local_today(settings, now)
    await add(db, *(DailyPick(viewer_id=viewer.id, pick_date=day, candidate_id=o.id, rank=i + 1,
                              distance_bucket="under_5_km", created_at=now) for i, o in enumerate(others)))  # fmt: skip


async def like(client: AsyncClient, who: Member, target: Member, **extra: Any) -> Any:
    return await client.post(
        "/v1/interactions", json={"target_id": str(target.id), "kind": "like", **extra}, headers=who.headers
    )


async def pass_(client: AsyncClient, who: Member, target: Member) -> Any:
    return await client.post(
        "/v1/interactions", json={"target_id": str(target.id), "kind": "pass"}, headers=who.headers
    )


async def count(db: Db, model: type, *where: Any) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())


# --- likes, passes, matches ---------------------------------------------------------


async def test_a_mutual_like_creates_exactly_one_match(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha, ravi = await woman(app, db, now), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)

    first = await like(client, asha, ravi)
    assert first.status_code == 201
    assert first.json()["match"] is None
    assert first.json()["likes_left_today"] == 9

    # Ravi never saw Asha in his set, but she liked him: she is in his likes received.
    received = (await client.get("/v1/likes/received", headers=ravi.headers)).json()
    assert [r["person"]["user_id"] for r in received] == [str(asha.id)]
    assert (await client.get(f"/v1/profiles/{asha.id}", headers=ravi.headers)).status_code == 200

    second = await like(client, ravi, asha)
    assert second.status_code == 201
    match = second.json()["match"]
    assert match is not None
    assert match["person"]["user_id"] == str(asha.id)
    assert await count(db, Match) == 1

    for who, other in ((asha, ravi), (ravi, asha)):
        matches = (await client.get("/v1/matches", headers=who.headers)).json()
        assert [m["person"]["user_id"] for m in matches] == [str(other.id)]
    assert (await client.get("/v1/likes/received", headers=ravi.headers)).json() == []  # decided


async def test_decisions_are_final_and_retries_are_idempotent(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha, ravi, kabir = await woman(app, db, now), await man(app, db, now), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi, kabir)
    await in_set(db, app.state.settings, now, ravi, asha)
    assert (await like(client, asha, ravi)).status_code == 201
    retry = await like(client, asha, ravi)
    assert retry.status_code == 200  # the original result, nothing new stored
    assert await count(db, Interaction, Interaction.actor_id == asha.id) == 1

    assert (await pass_(client, asha, kabir)).status_code == 201
    undo = await like(client, asha, kabir)
    assert undo.status_code == 409  # no undo in the MVP
    assert undo.json()["code"] == "already_decided"
    assert (await pass_(client, asha, kabir)).status_code == 200

    await like(client, ravi, asha)
    assert (await like(client, ravi, asha)).json()["match"] is not None  # the retry still reports the match
    assert await count(db, Match) == 1


async def test_only_reachable_people_can_be_liked(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, stranger = await woman(app, db, now), await man(app, db, now)
    for target in (stranger, Member(id=uuid.uuid4(), token="", photo_ids=[])):
        r = await like(client, asha, target)
        assert r.status_code == 404  # not in her set and has not liked her
    assert (await like(client, asha, asha)).status_code == 422
    assert await count(db, Interaction) == 0


@pytest.mark.parametrize(
    "change", ["blocked_by_target", "blocked_target", "target_suspended", "target_paused_after_liking"]
)
async def test_ineligible_people_cannot_match(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, change: str
) -> None:
    asha, ravi = await woman(app, db, now), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)
    assert (await like(client, asha, ravi)).status_code == 201  # Ravi can now like Asha back
    if change == "blocked_by_target":
        await add(db, Block(blocker_id=asha.id, blocked_id=ravi.id))
    elif change == "blocked_target":
        await add(db, Block(blocker_id=ravi.id, blocked_id=asha.id))
    async with db() as s:
        if change == "target_suspended":
            await s.execute(update(User).where(User.id == asha.id).values(status="suspended"))
        if change == "target_paused_after_liking":
            await s.execute(update(Profile).where(Profile.user_id == asha.id).values(discovery_paused=True))
        await s.commit()
    r = await like(client, ravi, asha)
    assert r.status_code == 404
    assert await count(db, Match) == 0
    assert (await client.get("/v1/likes/received", headers=ravi.headers)).json() == []
    assert (await client.get(f"/v1/profiles/{asha.id}", headers=ravi.headers)).status_code == 404


async def test_liking_needs_a_ready_profile(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha, ravi = await woman(app, db, now, photos=("approved", "pending")), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)
    r = await like(client, asha, ravi)
    assert r.status_code == 409
    assert r.json()["code"] == "profile_incomplete"


async def test_liked_only_members_are_seen_only_by_people_they_liked(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    shy, ravi = await woman(app, db, now, visibility="liked_only"), await man(app, db, now)
    assert (await client.get(f"/v1/profiles/{shy.id}", headers=ravi.headers)).status_code == 404
    await in_set(db, app.state.settings, now, shy, ravi)
    await like(client, shy, ravi)
    assert (await client.get(f"/v1/profiles/{shy.id}", headers=ravi.headers)).status_code == 200
    assert (await like(client, ravi, shy)).json()["match"] is not None


async def test_the_daily_like_limit_is_equal_and_resets(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    asha = await woman(app, db, now)
    men = [await man(app, db, now) for _ in range(12)]
    await in_set(db, app.state.settings, now, asha, *men)
    for i in range(10):
        assert (await like(client, asha, men[i])).status_code == 201
    over = await like(client, asha, men[10])
    assert over.status_code == 429
    assert over.json()["code"] == "like_limit"
    assert 0 < int(over.headers["retry-after"]) <= 86_400  # until midnight in India
    assert (await pass_(client, asha, men[10])).status_code == 201  # passes are not limited
    clock.advance(days=1)
    await in_set(db, app.state.settings, clock.now, asha, men[11])
    assert (await like(client, asha, men[11])).status_code == 201


async def test_a_like_can_be_about_a_photo_or_prompt(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    asha = await woman(app, db, now)
    ravi = await man(app, db, now, prompts=("festival",), photos=("approved", "approved", "pending"))
    other = await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)
    bad: list[dict[str, Any]] = [
        {"photo_id": str(other.photo_ids[0])},  # someone else's photo
        {"photo_id": str(ravi.photo_ids[2])},  # not approved
        {"prompt_key": "phrase"},  # a prompt he did not answer
    ]
    for extra in bad:
        r = await like(client, asha, ravi, **extra)
        assert r.status_code == 422, extra
        assert r.json()["code"] == "invalid_like_item"
    for extra in ({"comment": "x" * 151}, {"photo_id": str(ravi.photo_ids[0]), "prompt_key": "festival"}):
        assert (await like(client, asha, ravi, **extra)).status_code == 422
    r = await client.post(
        "/v1/interactions", headers=asha.headers,
        json={"target_id": str(ravi.id), "kind": "pass", "comment": "no thanks"},
    )  # fmt: skip
    assert r.status_code == 422
    ok = await like(client, asha, ravi, prompt_key="festival", comment="Holi is my favourite too!")
    assert ok.status_code == 201
    (received,) = (await client.get("/v1/likes/received", headers=ravi.headers)).json()
    assert received["comment"] == "Holi is my favourite too!"
    assert received["about"]["prompt_key"] == "festival"
    assert received["about"]["prompt_text"]


async def test_matches_stay_viewable_after_the_day_and_close_on_block(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    asha, ravi = await woman(app, db, now), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)
    await like(client, asha, ravi)
    await like(client, ravi, asha)
    clock.advance(days=3)  # no longer in anyone's set: the match keeps the profiles visible
    assert (await client.get(f"/v1/profiles/{ravi.id}", headers=asha.headers)).status_code == 200
    assert (await client.get(f"/v1/media/{ravi.photo_ids[0]}", headers=asha.headers)).status_code == 302
    await add(db, Block(blocker_id=ravi.id, blocked_id=asha.id))
    assert (await client.get("/v1/matches", headers=asha.headers)).json() == []
    assert (await client.get(f"/v1/profiles/{ravi.id}", headers=asha.headers)).status_code == 404
    assert (await client.get(f"/v1/profiles/{asha.id}", headers=ravi.headers)).status_code == 404


async def test_responses_reveal_no_contact_or_location(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha, ravi = await woman(app, db, now), await man(app, db, now)
    await in_set(db, app.state.settings, now, asha, ravi)
    await like(client, asha, ravi)
    for r in (await client.get("/v1/likes/received", headers=ravi.headers), await like(client, ravi, asha)):
        for forbidden in ("email", "birthdate", "latitude", "longitude", "interested_in", "visibility"):
            assert forbidden not in r.text


# --- concurrency: two people liking each other at the same moment -----------------


@pytest.fixture
def scratch_settings(base_settings: Settings) -> Iterator[Settings]:
    assert base_settings.migrations_database_url is not None
    owner = base_settings.migrations_database_url.get_secret_value()
    name = "datingapp_matching_test"
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
    application = create_app(scratch_settings, configure_logs=False)  # real commits, separate connections
    yield application
    keys = [k async for k in application.state.redis.scan_iter(match=f"{scratch_settings.rate_limit_prefix}:*")]
    if keys:
        await application.state.redis.delete(*keys)
    await close_app(application)


ROUNDS = 50


async def test_simultaneous_reciprocal_likes_create_exactly_one_match(committed: FastAPI) -> None:
    db: Db = committed.state.session_factory
    now = datetime.now().astimezone()
    pairs = []
    for _ in range(ROUNDS):
        a = await make_member(db, committed.state.storage, now, gender="woman", interested_in=("man",))
        b = await make_member(db, committed.state.storage, now, gender="man", interested_in=("woman",))
        await in_set(db, committed.state.settings, now, a, b)
        await in_set(db, committed.state.settings, now, b, a)
        pairs.append((a, b))

    async with AsyncClient(transport=ASGITransport(app=committed), base_url="http://testserver") as c:
        for a, b in pairs:
            ra, rb = await asyncio.gather(like(c, a, b), like(c, b, a))
            assert (ra.status_code, rb.status_code) == (201, 201)
            reported = [r.json()["match"] for r in (ra, rb) if r.json()["match"] is not None]
            assert len(reported) == 1, "exactly one of the two likes completes the match"

    async with db() as s:
        per_pair = (
            await s.execute(
                select(Match.user_a_id, Match.user_b_id, func.count()).group_by(Match.user_a_id, Match.user_b_id)
            )
        ).all()
    assert len(per_pair) == ROUNDS  # no missed match
    assert all(n == 1 for _, _, n in per_pair)  # no duplicate match
