"""Discreet notifications (stage 16, D093): devices tied to sessions, preferences,
what triggers a push and what it says, throttling, dead tokens and receipts,
notices from the team, and the Expo adapter against a fake server."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from redis.exceptions import RedisError
from sqlalchemy import select, update

from app.modules.auth.models import Session
from app.modules.notifications import service as notify
from app.modules.notifications.models import MemberNotice, PushDevice, PushTicket
from app.providers.push import ExpoPushSender, MemoryPushSender, PushMessage, PushUnavailableError
from tests.chat import Db, pair, send
from tests.members import Member, add, make_member
from tests.support import FrozenClock, JobRunner


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")
    return clock.now


def token(n: int = 1) -> str:
    return f"ExponentPushToken[device-{n:04d}-abcdefgh]"


async def phone(client: AsyncClient, who: Member, n: int = 1, platform: str = "android") -> None:
    r = await client.put("/v1/me/push-device", json={"token": token(n), "platform": platform}, headers=who.headers)
    assert r.status_code == 204, r.text


async def queued(jobs: JobRunner) -> list[tuple[str, str]]:
    return [(a["user_id"], a["kind"]) for _, name, a in await jobs.pending() if name == notify.SEND_PUSH]


# --- devices and preferences -------------------------------------------------------------


async def test_a_phone_is_registered_per_session_and_moves_with_its_token(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    ravi = await make_member(db, app.state.storage, now)
    for bad in ("not-a-token", "ExponentPushToken[]", "ExponentPushToken[a b c d e f]"):
        r = await client.put("/v1/me/push-device", json={"token": bad, "platform": "ios"}, headers=asha.headers)
        assert r.status_code == 422, bad
    r = await client.put("/v1/me/push-device", json={"token": token(), "platform": "windows"}, headers=asha.headers)
    assert r.status_code == 422
    await phone(client, asha)
    await phone(client, asha, platform="ios")  # the same session again: updated, not duplicated
    await phone(client, ravi)  # the phone changed hands: the token moves to Ravi's session
    async with db() as s:
        rows = (await s.execute(select(PushDevice.user_id, PushDevice.platform))).all()
    assert rows == [(ravi.id, "android")]
    assert (await client.delete("/v1/me/push-device", headers=ravi.headers)).status_code == 204
    async with db() as s:
        assert (await s.execute(select(PushDevice))).first() is None


async def test_preferences_default_to_on_and_can_be_changed(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    assert (await client.get("/v1/me/notifications", headers=asha.headers)).json() == {
        "matches": True, "messages": True, "likes": True,
    }  # fmt: skip
    body = {"matches": True, "messages": False, "likes": False}
    assert (await client.put("/v1/me/notifications", json=body, headers=asha.headers)).json() == body
    assert (await client.get("/v1/me/notifications", headers=asha.headers)).json() == body
    assert (await client.put("/v1/me/notifications", json={"matches": True}, headers=asha.headers)).status_code == 422


# --- what triggers a push, and what it says ------------------------------------------------


async def test_a_message_pushes_the_other_person_discreetly_once_per_ten_minutes(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner, now: datetime
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    await phone(client, ravi)
    assert (await send(client, asha, match_id, "Chai at Lodhi Garden on Sunday?")).status_code == 201
    assert (await send(client, asha, match_id, "Around 5?")).status_code == 201  # within 10 minutes: no second push
    assert await queued(jobs) == [(str(ravi.id), "message")]
    await jobs.run()
    (sent,) = jobs.push.sent
    assert sent == PushMessage(to=token(), title="Haanji", body="You have a new message.", data={"kind": "message"})
    blob = json.dumps(sent.__dict__)
    for leak in ("Chai", "Lodhi", "Asha", str(asha.id), str(match_id)):
        assert leak not in blob  # no text, no names, no IDs
    async with db() as s:
        assert (await s.execute(select(PushTicket.token))).scalars().all() == [token()]


async def test_likes_and_matches_push_the_other_person_and_passes_never_do(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner, now: datetime
) -> None:
    from tests.test_safety import introduce  # noqa: PLC0415 - shared helper

    asha = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",), name="Asha")
    ravi = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",), name="Ravi")
    kabir = await make_member(db, app.state.storage, now, gender="man", interested_in=("woman",), name="Kabir")
    await introduce(app, db, now, asha, ravi, kabir)

    async def like(who: Member, target: Member) -> httpx.Response:
        return await client.post(
            "/v1/interactions", json={"target_id": str(target.id), "kind": "like"}, headers=who.headers
        )

    assert (await like(asha, ravi)).status_code == 201
    r = await client.post("/v1/interactions", json={"target_id": str(kabir.id), "kind": "pass"}, headers=asha.headers)
    assert r.status_code == 201
    assert (await like(ravi, asha)).status_code == 201  # a match
    assert await queued(jobs) == [(str(ravi.id), "like"), (str(asha.id), "match")]


async def test_switched_off_signed_out_or_leaving_means_no_push(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner, now: datetime
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    await phone(client, ravi)
    body = {"matches": True, "messages": False, "likes": True}
    assert (await client.put("/v1/me/notifications", json=body, headers=ravi.headers)).status_code == 200
    await send(client, asha, match_id, "Hi")
    await jobs.run()
    assert jobs.push.sent == []  # messages switched off

    async with db() as s:
        await s.execute(update(Session).where(Session.user_id == ravi.id).values(revoked_at=now))
        await s.commit()
    async with db() as s:
        sent = await notify.send_push(s, jobs.push, "Haanji", user_id=ravi.id, kind=notify.Kind.match, now=now)
    assert sent == 0  # signed out: the phone's session is gone, so is the push


async def test_dead_tokens_are_dropped_and_receipts_are_checked_later(
    app: FastAPI, client: AsyncClient, db: Db, *, jobs: JobRunner, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    ravi = await make_member(db, app.state.storage, now)
    await phone(client, asha, 1)
    await phone(client, ravi, 2)
    jobs.push.dead.add(token(1))
    async with db() as s:
        assert await notify.send_push(s, jobs.push, "Haanji", user_id=asha.id, kind=notify.Kind.match, now=now) == 0
        assert await notify.send_push(s, jobs.push, "Haanji", user_id=ravi.id, kind=notify.Kind.match, now=now) == 1
    async with db() as s:
        assert (await s.execute(select(PushDevice.token))).scalars().all() == [token(2)]  # the dead one went at once

    class Receipts(MemoryPushSender):
        async def receipts(self, ids: list[str]) -> dict[str, str | None]:
            return dict.fromkeys(ids, "DeviceNotRegistered")

    async with db() as s:
        assert await notify.check_receipts(s, Receipts(), now + timedelta(minutes=10)) == 0  # too early
        assert await notify.check_receipts(s, Receipts(), now + timedelta(minutes=16)) == 1
    async with db() as s:
        assert (await s.execute(select(PushDevice))).first() is None
        assert (await s.execute(select(PushTicket))).first() is None
        await add(db, PushTicket(receipt_id="old", token=token(9), created_at=now - timedelta(hours=25)))
    async with db() as s:
        await notify.check_receipts(s, MemoryPushSender(), now)  # no receipt came back: gone after a day anyway
        assert (await s.execute(select(PushTicket))).first() is None


async def test_a_redis_outage_never_fails_the_message(
    app: FastAPI, client: AsyncClient, db: Db, *, jobs: JobRunner, now: datetime, monkeypatch: pytest.MonkeyPatch
) -> None:
    asha, _, match_id = await pair(app, db, now)

    async def down(*_: Any, **__: Any) -> None:
        raise RedisError("down")

    monkeypatch.setattr(app.state.redis, "set", down)
    assert (await send(client, asha, match_id, "Still sent")).status_code == 201
    assert await queued(jobs) == []


# --- notices from the team -----------------------------------------------------------------


async def test_a_warning_reaches_the_member_in_the_app_and_by_push_even_with_pushes_off(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner, now: datetime
) -> None:
    asha, ravi, _ = await pair(app, db, now)
    moderator = await make_member(
        db, app.state.storage, now, role="moderator", profile=False, session_client="web_admin"
    )
    await phone(client, ravi)
    off = {"matches": False, "messages": False, "likes": False}
    assert (await client.put("/v1/me/notifications", json=off, headers=ravi.headers)).status_code == 200
    r = await client.post("/v1/reports", json={"subject_id": str(ravi.id), "reason": "harassment", "block": False},
                          headers=asha.headers)  # fmt: skip
    assert r.status_code == 201
    r = await client.post(
        f"/v1/admin/reports/{r.json()['id']}/actions", json={"action": "warn"}, headers=moderator.headers
    )
    assert r.status_code == 201, r.text

    notices = (await client.get("/v1/me/notices", headers=ravi.headers)).json()
    assert [(n["kind"], n["read"]) for n in notices] == [("warning", False)]
    assert (await client.get("/v1/me/notices", headers=asha.headers)).json() == []  # nobody else sees it
    assert (await client.post(f"/v1/me/notices/{notices[0]['id']}/read", headers=asha.headers)).status_code == 404
    assert (await client.post(f"/v1/me/notices/{notices[0]['id']}/read", headers=ravi.headers)).status_code == 204
    assert (await client.post(f"/v1/me/notices/{notices[0]['id']}/read", headers=ravi.headers)).status_code == 204
    assert (await client.get("/v1/me/notices", headers=ravi.headers)).json()[0]["read"] is True

    await jobs.run()
    assert [(m.to, m.body) for m in jobs.push.sent] == [(token(), "You have a notice from the team.")]
    async with db() as s:
        assert (await s.execute(select(MemberNotice.user_id))).scalars().all() == [ravi.id]


# --- the Expo adapter, against a fake server ----------------------------------------------------


def fake_expo(seen: list[httpx.Request], answer: Any) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        response: httpx.Response = answer(request) if callable(answer) else answer
        return response

    return httpx.MockTransport(handler)


async def test_the_expo_adapter_batches_parses_tickets_and_retries_only_what_can_recover() -> None:
    seen: list[httpx.Request] = []

    def tickets(request: httpx.Request) -> httpx.Response:
        sent = json.loads(request.content)
        dead = {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}
        data = [dead if m["to"].endswith("dead]") else {"status": "ok", "id": f"r{i}"} for i, m in enumerate(sent)]
        return httpx.Response(200, json={"data": data})

    expo = ExpoPushSender("expo-access-token", transport=fake_expo(seen, tickets))
    messages = [PushMessage(to=f"ExponentPushToken[t{i}]", title="Haanji", body="x") for i in range(249)]
    messages.append(PushMessage(to="ExponentPushToken[dead]", title="Haanji", body="x"))
    out = await expo.send(messages)
    assert [len(json.loads(r.content)) for r in seen] == [100, 100, 50]  # at most 100 per request
    assert all(r.url == "https://exp.host/--/api/v2/push/send" for r in seen)
    assert seen[0].headers["authorization"] == "Bearer expo-access-token"
    assert json.loads(seen[0].content)[0] == {"to": "ExponentPushToken[t0]", "title": "Haanji", "body": "x", "data": {},
                                             "sound": "default", "priority": "high"}  # fmt: skip
    assert (out[0].ok, out[0].receipt_id) == (True, "r0")
    assert (out[-1].ok, out[-1].error) == (False, "DeviceNotRegistered")
    await expo.aclose()

    receipts = ExpoPushSender(None, transport=fake_expo(seen := [], httpx.Response(200, json={"data": {
        "a": {"status": "ok"}, "b": {"status": "error", "details": {"error": "DeviceNotRegistered"}},
    }})))  # fmt: skip
    assert await receipts.receipts(["a", "b", "c"]) == {"a": None, "b": "DeviceNotRegistered"}
    assert "authorization" not in seen[0].headers  # no token configured: none sent

    for status in (429, 503):
        flaky = ExpoPushSender(None, transport=fake_expo([], httpx.Response(status)))
        with pytest.raises(PushUnavailableError):  # retried by the job, with backoff
            await flaky.send(messages[:1])
    broken = ExpoPushSender(None, transport=fake_expo([], httpx.Response(400, json={"errors": []})))
    with pytest.raises(httpx.HTTPStatusError):  # our request is wrong: not retried
        await broken.send(messages[:1])

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(PushUnavailableError):
        await ExpoPushSender(None, transport=httpx.MockTransport(offline)).send(messages[:1])


def test_the_retry_policy_only_retries_outages() -> None:
    from app.modules.notifications.tasks import RETRY  # noqa: PLC0415

    assert RETRY.retry_exceptions == {PushUnavailableError}
