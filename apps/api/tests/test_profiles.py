"""F02 profiles: create, edit, validate, privacy, area limits, access (T05, T07)."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from tests.support import FrozenClock, JobRunner, bearer, signup

PROFILE: dict[str, Any] = {
    "display_name": "Asha",
    "gender": "woman",
    "interested_in": ["man"],
    "intent": "long_term",
    "bio": "Weekend hiker, weekday product designer.",
    "area_id": "delhi.saket",
    "prompts": [
        {"key": "comfort_food", "answer": "Rajma chawal, always."},
        {"key": "next_trip", "answer": "Spiti in the spring."},
    ],
}


async def member(client: AsyncClient, jobs: JobRunner, email: str) -> dict[str, str]:
    session = await signup(client, jobs, email)
    return {"id": session["user"]["id"], **bearer(session["token"])}


async def put(client: AsyncClient, who: dict[str, str], **changes: Any) -> Any:
    headers = {"authorization": who["authorization"]}
    return await client.put("/v1/me/profile", json={**PROFILE, **changes}, headers=headers)


def auth(who: dict[str, str]) -> dict[str, str]:
    return {"authorization": who["authorization"]}


async def test_areas_and_prompts_are_listed_without_coordinates(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    areas = (await client.get("/v1/areas", headers=auth(me))).json()
    assert {"id": "delhi.saket", "city": "Delhi", "name": "Saket"} in areas
    assert all(set(a) == {"id", "city", "name"} for a in areas)
    prompts = (await client.get("/v1/prompts", headers=auth(me))).json()
    assert {p["key"] for p in prompts} >= {"comfort_food", "next_trip"}


async def test_create_read_and_replace_a_profile(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    missing = await client.get("/v1/me/profile", headers=auth(me))
    assert missing.status_code == 404
    assert missing.json()["code"] == "profile_not_found"

    r = await put(client, me)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "Asha"
    assert body["age"] == 27
    assert body["area"] == {"id": "delhi.saket", "city": "Delhi", "name": "Saket"}
    assert [p["key"] for p in body["prompts"]] == ["comfort_food", "next_trip"]
    assert body["prompts"][0]["text"]  # the catalogue text comes back with the answer
    assert body["visibility"] == "everyone"
    assert body["readiness"] == {
        "ready": False, "missing": ["approved_photos"], "approved_photos": 0, "approved_photos_needed": 2,
    }  # fmt: skip
    assert "latitude" not in r.text
    assert "longitude" not in r.text

    r = await put(client, me, prompts=[{"key": "festival", "answer": "Diwali, for the food."}], bio=None)
    assert r.status_code == 200
    assert [p["key"] for p in r.json()["prompts"]] == ["festival"]
    assert r.json()["bio"] is None
    assert (await client.get("/v1/me/profile", headers=auth(me))).json() == r.json() | {"photos": r.json()["photos"]}


@pytest.mark.parametrize(
    "change",
    [
        {"display_name": "Asha 9876543210"},  # numbers (a phone number)
        {"display_name": "asha@example.com"},
        {"display_name": "Asha www.example.in"},
        {"display_name": "A" * 41},
        {"display_name": "Asha\u0007"},  # control character
        {"display_name": "Asha\u200bX"},  # zero-width space (hidden text)
        {"display_name": "!!!"},
        {"gender": "other"},
        {"interested_in": []},
        {"interested_in": ["man", "man"]},
        {"intent": "casual"},  # no hook-up intent at launch (D050)
        {"bio": "x" * 501},
        {"bio": "\n".join(["line"] * 9)},
        {"prompts": [{"key": "not_in_catalogue", "answer": "hi"}]},
        {"prompts": [{"key": "festival", "answer": "a"}, {"key": "festival", "answer": "b"}]},
        {"prompts": [{"key": k, "answer": "a"} for k in ("festival", "phrase", "next_trip", "city_corner")]},
        {"prompts": [{"key": "festival", "answer": "x" * 201}]},
        {"is_verified": True},  # unknown fields are rejected
    ],
)
async def test_invalid_profiles_are_rejected(client: AsyncClient, jobs: JobRunner, change: dict[str, Any]) -> None:
    me = await member(client, jobs, "a@example.com")
    r = await put(client, me, **change)
    assert r.status_code == 422, (change, r.text)
    assert r.json()["code"] == "validation_error"


async def test_unknown_area_is_rejected(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    r = await put(client, me, area_id="mumbai.bandra")
    assert r.status_code == 422
    assert r.json()["code"] == "unknown_area"


async def test_names_in_indian_scripts_are_welcome(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    for name in ("आशा", "অশা", "ஆஷா", "क्\u200dष"):  # the last uses a zero-width joiner, which Indic text needs
        r = await put(client, me, display_name=name)
        assert r.status_code == 200, (name, r.text)
        assert r.json()["display_name"] == name


async def test_area_changes_are_limited_to_one_a_day(client: AsyncClient, jobs: JobRunner, clock: FrozenClock) -> None:
    me = await member(client, jobs, "a@example.com")
    assert (await put(client, me)).status_code == 200
    r = await put(client, me, area_id="delhi.dwarka")
    assert r.status_code == 429
    assert r.json()["code"] == "area_change_limited"
    assert 0 < int(r.headers["retry-after"]) <= 86_400
    assert (await put(client, me, display_name="Asha R")).status_code == 200  # other edits are fine
    clock.advance(hours=24)
    assert (await put(client, me, area_id="delhi.dwarka")).json()["area"]["id"] == "delhi.dwarka"


async def test_privacy_settings(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    early = await client.patch("/v1/me/privacy", json={"discovery_paused": True}, headers=auth(me))
    assert early.status_code == 409
    await put(client, me)
    r = await client.patch("/v1/me/privacy", json={"visibility": "liked_only"}, headers=auth(me))
    assert r.json()["visibility"] == "liked_only"
    assert r.json()["discovery_paused"] is False
    r = await client.patch("/v1/me/privacy", json={"discovery_paused": True}, headers=auth(me))
    assert (r.json()["visibility"], r.json()["discovery_paused"]) == ("liked_only", True)
    assert (await client.patch("/v1/me/privacy", json={}, headers=auth(me))).status_code == 422
    bad = await client.patch("/v1/me/privacy", json={"visibility": "public"}, headers=auth(me))
    assert bad.status_code == 422


async def test_others_profiles_are_not_found_unless_the_policy_allows(client: AsyncClient, jobs: JobRunner) -> None:
    asha = await member(client, jobs, "asha@example.com")
    ravi = await member(client, jobs, "ravi@example.com")
    await put(client, asha)
    # No daily set, match or like exists yet (stages 8-9), so Ravi cannot see Asha:
    # the answer is the same as for a profile that does not exist.
    seen = await client.get(f"/v1/profiles/{asha['id']}", headers=auth(ravi))
    ghost = await client.get(f"/v1/profiles/{uuid.uuid4()}", headers=auth(ravi))
    assert seen.status_code == ghost.status_code == 404
    assert seen.json()["code"] == ghost.json()["code"] == "not_found"


async def test_my_public_preview_hides_private_fields(client: AsyncClient, jobs: JobRunner) -> None:
    me = await member(client, jobs, "a@example.com")
    await put(client, me)
    r = await client.get(f"/v1/profiles/{me['id']}", headers=auth(me))
    assert r.status_code == 200
    body = r.json()
    for private in ("email", "birthdate", "visibility", "discovery_paused", "interested_in", "readiness"):
        assert private not in body
    assert "a@example.com" not in r.text
    assert body["photos"] == []  # only approved photos would appear here


async def test_profile_routes_need_a_session(client: AsyncClient) -> None:
    for method, path in (("GET", "/v1/me/profile"), ("PUT", "/v1/me/profile"), ("GET", "/v1/areas"),
                         ("PATCH", "/v1/me/privacy"), ("GET", f"/v1/profiles/{uuid.uuid4()}")):  # fmt: skip
        r = await client.request(method, path, json=PROFILE if method != "GET" else None)
        assert r.status_code == 401, path
