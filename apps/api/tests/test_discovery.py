"""F03 discovery: preferences, eligibility before ranking, the finite daily
set, stability, mid-day removal, response privacy and access (T05-T08)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.discovery import rules
from app.modules.discovery.models import Block, DailyPick, Interaction, InteractionKind
from app.modules.discovery.service import TODAY_LIMIT
from app.modules.profiles.models import Intent, Profile
from tests.members import Member, add, make_member
from tests.support import FrozenClock

Db = async_sessionmaker[AsyncSession]


# --- pure rules ----------------------------------------------------------------


def test_distance_buckets_between_area_centroids() -> None:
    cp, saket, dwarka, noida = (28.63, 77.22), (28.52, 77.21), (28.59, 77.05), (28.57, 77.32)
    assert rules.bucket(rules.distance_km(*cp, *cp)) == "under_5_km"
    assert rules.bucket(rules.distance_km(*cp, *saket)) == "5_to_15_km"  # about 12 km
    assert rules.bucket(rules.distance_km(*dwarka, *noida)) == "15_to_50_km"  # about 27 km
    assert rules.bucket(rules.distance_km(28.63, 77.22, 26.91, 75.79)) == "over_50_km"  # Jaipur
    assert rules.bucket(4.99) == "under_5_km"
    assert rules.bucket(5.0) == "5_to_15_km"


def test_intent_compatibility_is_symmetric() -> None:
    for a in Intent:
        for b in Intent:
            assert rules.intents_compatible(a, b) == rules.intents_compatible(b, a)
    assert rules.intents_compatible(Intent.marriage, Intent.long_term)
    assert not rules.intents_compatible(Intent.marriage, Intent.figuring_out)


def test_tie_break_is_stable_within_a_day_and_changes_across_days() -> None:
    v, c = uuid.uuid4(), uuid.uuid4()
    assert rules.tie_break(v, c, date(2026, 11, 4)) == rules.tie_break(v, c, date(2026, 11, 4))
    assert rules.tie_break(v, c, date(2026, 11, 4)) != rules.tie_break(v, c, date(2026, 11, 5))


# --- API -------------------------------------------------------------------------


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    # 09:00 UTC is 14:30 in India: the "today" date is unambiguous.
    clock.now = datetime.fromisoformat("2026-11-04T09:00:00+00:00")
    return clock.now


async def viewer(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    base: dict[str, Any] = {
        "gender": "woman",
        "interested_in": ("man",),
        "intent": "long_term",
        "age": 27,
        "name": "Viewer",
    }
    return await make_member(db, app.state.storage, now, **{**base, **kw})


async def candidate(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await make_member(db, app.state.storage, now, **kw)


async def today_ids(client: AsyncClient, who: Member) -> list[str]:
    r = await client.get("/v1/discovery/today", headers=who.headers)
    assert r.status_code == 200, r.text
    return [c["user_id"] for c in r.json()["cards"]]


async def test_viewer_must_have_a_ready_unpaused_profile(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    for kw, code in (
        ({"profile": False}, "profile_incomplete"),
        ({"photos": ("approved", "pending")}, "profile_incomplete"),
        ({"paused": True}, "discovery_paused"),
    ):
        v = await viewer(app, db, now, **kw)
        r = await client.get("/v1/discovery/today", headers=v.headers)
        assert r.status_code == 409, kw
        assert r.json()["code"] == code


INELIGIBLE: list[tuple[str, dict[str, Any]]] = [
    ("wrong gender for the viewer", {"gender": "woman", "interested_in": ("woman",)}),
    ("not interested in the viewer's gender", {"interested_in": ("man",)}),
    ("incompatible intent", {"intent": "figuring_out"}),  # the viewer wants marriage below
    ("older than the viewer allows", {"age": 41}),
    ("viewer is older than they allow", {"prefs": (18, 25, None)}),
    ("further than they allow", {"area_id": "noida.greater-noida", "prefs": (18, 99, 15)}),
    ("further than the viewer allows", {"area_id": "faridabad.central", "_viewer_prefs": (24, 40, 15)}),  # ~16 km
    ("only shows themselves to people they liked", {"visibility": "liked_only"}),
    ("paused", {"paused": True}),
    ("fewer than 2 approved photos", {"photos": ("approved", "pending", "rejected")}),
    ("suspended", {"status": "suspended"}),
    ("leaving (deletion requested)", {"deletion_requested": True}),
    ("no profile", {"profile": False}),
]


@pytest.mark.parametrize(("reason", "kw"), INELIGIBLE, ids=[r for r, _ in INELIGIBLE])
async def test_filters_run_before_ranking(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, *, reason: str, kw: dict[str, Any]
) -> None:
    kw = dict(kw)
    viewer_prefs = kw.pop("_viewer_prefs", (24, 40, 50))
    v = await viewer(app, db, now, intent="marriage", prefs=viewer_prefs, area_id="delhi.saket")
    eligible = await candidate(app, db, now, intent="marriage", age=30)
    excluded = await candidate(app, db, now, **{"intent": "marriage", "age": 30, **kw})
    ids = await today_ids(client, v)
    assert str(eligible.id) in ids
    assert str(excluded.id) not in ids, reason


@pytest.mark.parametrize(
    "kind", ["block_by_viewer", "block_by_candidate", "viewer_liked", "viewer_passed", "candidate_passed"]
)
async def test_blocks_and_prior_interactions_exclude(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, kind: str
) -> None:
    v = await viewer(app, db, now)
    eligible = await candidate(app, db, now)
    excluded = await candidate(app, db, now)
    row = {
        "block_by_viewer": Block(blocker_id=v.id, blocked_id=excluded.id),
        "block_by_candidate": Block(blocker_id=excluded.id, blocked_id=v.id),
        "viewer_liked": Interaction(actor_id=v.id, target_id=excluded.id, kind=InteractionKind.like),
        "viewer_passed": Interaction(actor_id=v.id, target_id=excluded.id, kind=InteractionKind.passed),
        "candidate_passed": Interaction(actor_id=excluded.id, target_id=v.id, kind=InteractionKind.passed),
    }[kind]
    await add(db, row)
    ids = await today_ids(client, v)
    assert str(eligible.id) in ids
    assert str(excluded.id) not in ids
    assert str(v.id) not in ids


async def test_someone_who_liked_the_viewer_can_still_appear(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    v = await viewer(app, db, now)
    fan = await candidate(app, db, now)
    await add(db, Interaction(actor_id=fan.id, target_id=v.id, kind=InteractionKind.like))
    assert str(fan.id) in await today_ids(client, v)


async def test_the_set_is_finite_ranked_and_stable_all_day(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    v = await viewer(app, db, now, prompts=("festival", "next_trip"))
    best = await candidate(app, db, now, prompts=("festival", "next_trip", "phrase"), bio="Hello.",
                           photos=("approved",) * 4, area_id="delhi.hauz-khas")  # fmt: skip
    others = [await candidate(app, db, now, intent="marriage", last_active=timedelta(days=30)) for _ in range(19)]
    r = await client.get("/v1/discovery/today", headers=v.headers)
    body = r.json()
    assert body["size_limit"] == 15
    assert len(body["cards"]) == 15
    assert [c["rank"] for c in body["cards"]] == list(range(1, 16))
    assert body["cards"][0]["user_id"] == str(best.id)  # same intent, shared prompts, active, complete, close

    late = await candidate(
        app, db, now, prompts=("festival", "next_trip", "phrase"), bio="Hi.", photos=("approved",) * 4
    )
    again = [c["user_id"] for c in (await client.get("/v1/discovery/today", headers=v.headers)).json()["cards"]]
    assert again == [c["user_id"] for c in body["cards"]]  # built once a day: a newcomer waits for tomorrow
    assert str(late.id) not in again

    clock.advance(days=1)
    tomorrow = await today_ids(client, v)
    assert str(late.id) in tomorrow
    assert len(others) == 19


async def test_unavailable_people_leave_todays_set_at_once(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    v = await viewer(app, db, now)
    blocker, pauser, keeper = [await candidate(app, db, now) for _ in range(3)]
    assert {str(blocker.id), str(pauser.id), str(keeper.id)} <= set(await today_ids(client, v))
    await add(db, Block(blocker_id=blocker.id, blocked_id=v.id))
    async with db() as s:
        await s.execute(update(Profile).where(Profile.user_id == pauser.id).values(discovery_paused=True))
        await s.commit()
    ids = await today_ids(client, v)
    assert str(keeper.id) in ids
    assert str(blocker.id) not in ids
    assert str(pauser.id) not in ids
    # The profile itself is gone too: the access policy re-checks availability.
    assert (await client.get(f"/v1/profiles/{blocker.id}", headers=v.headers)).status_code == 404
    assert (await client.get(f"/v1/profiles/{keeper.id}", headers=v.headers)).status_code == 200


async def test_cards_hold_a_distance_bucket_never_location_or_contact(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    v = await viewer(app, db, now, area_id="delhi.connaught-place")
    await candidate(app, db, now, area_id="delhi.saket")
    r = await client.get("/v1/discovery/today", headers=v.headers)
    card = r.json()["cards"][0]
    assert card["distance"] == "5_to_15_km"
    assert card["area"] == {"id": "delhi.saket", "city": "Delhi", "name": "Saket"}
    for forbidden in ("latitude", "longitude", "distance_km", "email", "birthdate", "interested_in", "visibility"):
        assert forbidden not in r.text
    assert all(p["moderation_state"] == "approved" for p in card["photos"])


async def test_access_follows_todays_set(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    v = await viewer(app, db, now)
    shown = await candidate(app, db, now, photos=("approved", "approved", "pending"))
    stranger = await candidate(app, db, now, gender="woman")  # not a match for the viewer: never in the set
    await today_ids(client, v)
    assert (await client.get(f"/v1/profiles/{shown.id}", headers=v.headers)).status_code == 200
    assert (await client.get(f"/v1/media/{shown.photo_ids[0]}", headers=v.headers)).status_code == 302
    assert (await client.get(f"/v1/media/{shown.photo_ids[2]}", headers=v.headers)).status_code == 404  # pending
    assert (await client.get(f"/v1/profiles/{stranger.id}", headers=v.headers)).status_code == 404
    assert (await client.get(f"/v1/media/{stranger.photo_ids[0]}", headers=v.headers)).status_code == 404
    # The relation is one-way: being in someone's set does not open theirs.
    assert (await client.get(f"/v1/profiles/{v.id}", headers=shown.headers)).status_code == 404


async def test_preferences_defaults_validation_and_storage(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    v = await viewer(app, db, now)
    r = await client.get("/v1/me/preferences", headers=v.headers)
    assert r.json() == {"age_min": 18, "age_max": 99, "max_distance_km": None, "applies_from": "next_set"}
    r = await client.put(
        "/v1/me/preferences", json={"age_min": 25, "age_max": 35, "max_distance_km": 15}, headers=v.headers
    )
    assert r.status_code == 200
    assert r.json()["max_distance_km"] == 15
    bad_bodies: list[dict[str, Any]] = [
        {"age_min": 30, "age_max": 25},
        {"age_min": 17, "age_max": 30},
        {"age_min": 20, "age_max": 30, "max_distance_km": 7},
        {"age_min": 20, "age_max": 30, "genders": ["man"]},  # unknown field
    ]
    for bad in bad_bodies:
        assert (await client.put("/v1/me/preferences", json=bad, headers=v.headers)).status_code == 422, bad


async def test_old_picks_are_deleted_after_seven_days(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    v = await viewer(app, db, now)
    await candidate(app, db, now)
    await today_ids(client, v)
    clock.advance(days=9)
    await today_ids(client, v)
    async with db() as s:
        dates = set((await s.execute(select(DailyPick.pick_date).where(DailyPick.viewer_id == v.id))).scalars())
    assert dates == {clock.now.date()}


async def test_discovery_is_rate_limited(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    v = await viewer(app, db, now)
    limiter = app.state.auth.limiter
    await app.state.redis.set(limiter._redis_key(TODAY_LIMIT, str(v.id)), TODAY_LIMIT.limit, ex=3600)
    assert (await client.get("/v1/discovery/today", headers=v.headers)).status_code == 429
