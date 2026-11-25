"""Live, random one-to-one video calls (stage 23, D123): who may call, pairing
both ways, the free minute and the plan, the call's life and its clock, cleaned
descriptions (no address but the relay's), the relay adapter, reports from a
call and the hold they put on Live, a like after a call, and the ends: account
deletion, a ban and the retention sweep."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import select

from app.config import Settings
from app.modules.billing.models import Subscription
from app.modules.calls.models import Call, CallMember, CallQueueEntry
from app.modules.calls.sdp import InvalidSdpError, clean_sdp
from app.modules.calls.service import RULES_VERSION
from app.modules.discovery.models import Block, Match, Preferences
from app.modules.privacy import service as privacy
from app.modules.profiles.models import Profile
from app.providers.ice import CloudflareIce, DirectIce, IceServer, IceUnavailableError, NoIce
from tests.chat import Db
from tests.conftest import committed_app, scratch_database
from tests.members import Member, add, make_member
from tests.support import FrozenClock

# --- descriptions ------------------------------------------------------------------

HOME_IP, PUBLIC_IP, DEFAULT_IP, RELAY_IP = "192.168.1.4", "198.51.100.7", "203.0.113.9", "104.30.0.5"

OFFER = (
    "\r\n".join(
        [
            "v=0",
            "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
            "s=-",
            "t=0 0",
            "a=group:BUNDLE 0",
            "m=video 60000 UDP/TLS/RTP/SAVPF 96",
            f"c=IN IP4 {DEFAULT_IP}",
            f"a=rtcp:9 IN IP4 {DEFAULT_IP}",
            f"a=candidate:1 1 udp 2122260223 {HOME_IP} 50000 typ host generation 0",
            "a=candidate:2 1 udp 2122260223 4a1c2d3e-aaaa-bbbb-cccc-1234567890ab.local 50001 typ host generation 0",
            f"a=candidate:3 1 udp 1686052607 {PUBLIC_IP} 50002 typ srflx raddr {HOME_IP} rport 50000 generation 0",
            f"a=candidate:4 1 udp 41885439 {RELAY_IP} 60000 typ relay raddr {PUBLIC_IP} rport 50002 generation 0"
            " network-cost 10",
            "a=ice-ufrag:abcd",
            "a=ice-pwd:efghijklmnopqrstuvwxyz12",
            "a=fingerprint:sha-256 AB:CD:EF",
            "a=setup:actpass",
            "a=mid:0",
            "a=sendrecv",
            "a=rtcp-mux",
            "a=rtpmap:96 VP8/90000",
        ]
    )
    + "\r\n"
)
ANSWER = OFFER.replace("a=setup:actpass", "a=setup:active").replace("4611731400430051336", "77")


async def test_relay_only_descriptions_keep_no_address_but_the_relays() -> None:
    """LIVE-1: home, mDNS and public addresses never reach the other person."""
    cleaned = clean_sdp(OFFER, relay_only=True)
    for leak in (HOME_IP, PUBLIC_IP, DEFAULT_IP, ".local"):
        assert leak not in cleaned
    candidates = [line for line in cleaned.split("\r\n") if line.startswith("a=candidate:")]
    assert candidates == [
        f"a=candidate:4 1 udp 41885439 {RELAY_IP} 60000 typ relay raddr 0.0.0.0 rport 0 generation 0 network-cost 10"
    ]
    assert "c=IN IP4 0.0.0.0" in cleaned
    assert "a=rtcp:9 IN IP4 0.0.0.0" in cleaned
    assert "a=fingerprint:sha-256 AB:CD:EF\r\n" in cleaned
    assert cleaned.endswith("\r\n")
    # Direct (development and tests): unchanged.
    assert clean_sdp(OFFER, relay_only=False) == OFFER


@pytest.mark.parametrize(
    "bad",
    [
        "hello",
        "v=0\r\nnot a line\r\n",
        "v=0\r\na=x\x00y\r\n",
        "v=0\r\na=candidate:1 1 udp\r\n",
        OFFER.replace("typ relay", "typ srflx"),  # nothing would be left to connect through
        "v=0\r\n" + "a=x\r\n" * 6000,
    ],
)
async def test_bad_descriptions_are_refused(bad: str) -> None:
    with pytest.raises(InvalidSdpError):
        clean_sdp(bad, relay_only=True)


# --- the relay adapter and settings ----------------------------------------------------


async def test_cloudflare_relay_credentials() -> None:
    """LIVE-2: short-lived credentials from Cloudflare's documented endpoint; STUN
    and port-53 URLs dropped (no trickle ICE)."""
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            201,
            json={
                "iceServers": [
                    {"urls": ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"]},
                    {
                        "urls": [
                            "turn:turn.cloudflare.com:3478?transport=udp",
                            "turn:turn.cloudflare.com:53?transport=udp",
                            "turn:turn.cloudflare.com:3478?transport=tcp",
                            "turns:turn.cloudflare.com:5349?transport=tcp",
                            "turns:turn.cloudflare.com:443?transport=tcp",
                        ],
                        "username": "u-short-lived",
                        "credential": "c-short-lived",
                    },
                ]
            },
        )

    relay = CloudflareIce("key123", "token-abc", transport=httpx.MockTransport(answer))
    servers = await relay.servers(180)
    assert servers == [
        IceServer(
            urls=[
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:3478?transport=tcp",
                "turns:turn.cloudflare.com:5349?transport=tcp",
                "turns:turn.cloudflare.com:443?transport=tcp",
            ],
            username="u-short-lived",
            credential="c-short-lived",
        )
    ]
    (request,) = seen
    assert request.method == "POST"
    assert str(request.url) == "https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers"
    assert request.headers["authorization"] == "Bearer token-abc"
    assert json.loads(request.content) == {"ttl": 180}
    assert relay.relay_only

    for status, body in ((503, {}), (201, {"iceServers": [{"urls": ["stun:x:3478"]}]}), (201, {"nope": 1})):
        broken = CloudflareIce(
            "k", "t", transport=httpx.MockTransport(lambda _r, s=status, b=body: httpx.Response(s, json=b))
        )
        with pytest.raises(IceUnavailableError):
            await broken.servers(60)
    await relay.aclose()


async def test_live_settings_rules(base_settings: Settings) -> None:
    """LIVE-3: the Cloudflare relay needs its key; servers people use never run without a relay;
    empty values (compose's `${X:-}` on the beta) mean not set."""
    unset = Settings.model_validate(
        {**base_settings.model_dump(), "cloudflare_turn_key_id": "", "cloudflare_turn_api_token": " ",
         "razorpay_key_id": "", "razorpay_plan_id": ""}
    )  # fmt: skip
    assert (unset.cloudflare_turn_key_id, unset.cloudflare_turn_api_token, unset.razorpay_key_id) == (None, None, None)
    with pytest.raises(ValidationError, match="CLOUDFLARE_TURN_KEY_ID"):
        Settings.model_validate({**base_settings.model_dump(), "calls_ice": "cloudflare"})
    with pytest.raises(ValidationError, match="Live calls need the relay in beta"):
        Settings.model_validate(
            {
                **base_settings.model_dump(), "app_env": "beta", "calls_ice": "direct", "email_backend": "smtp",
                "smtp_host": "smtp.example.com", "terms_version": "beta-1", "privacy_version": "beta-1",
                "signup_invite_only": True, "site_url": "https://example.in",
            }
        )  # fmt: skip


# --- helpers ----------------------------------------------------------------------------


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-18T09:00:00+00:00")  # 14:30 in India
    return clock.now


@pytest.fixture
def published(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> list[tuple[set[uuid.UUID], dict[str, Any]]]:
    sent: list[tuple[set[uuid.UUID], dict[str, Any]]] = []

    async def record(to: Any, event: dict[str, Any]) -> None:
        sent.append((set(to), event))

    monkeypatch.setattr(app.state.realtime, "publish", record)
    return sent


@pytest.fixture(autouse=True)
def direct(app: FastAPI) -> None:
    app.state.ice = DirectIce()


class RelayForTests:
    relay_only = True

    async def servers(self, ttl_s: int) -> list[IceServer]:
        return [IceServer(urls=["turn:relay.example:3478?transport=udp"], username=f"u{ttl_s}", credential="c")]


async def member(app: FastAPI, db: Db, now: datetime, *, rules: bool = True, **kw: Any) -> Member:
    m = await make_member(db, app.state.storage, now, **kw)
    if rules:
        await add(db, CallMember(user_id=m.id, rules_version=RULES_VERSION, rules_accepted_at=now))
    return m


async def woman(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await member(app, db, now, **{"gender": "woman", "interested_in": ("man",), "name": "Meera", **kw})


async def man(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await member(app, db, now, **{"gender": "man", "interested_in": ("woman",), "name": "Kabir", **kw})


async def join(client: AsyncClient, who: Member, device: str = "device-0001") -> httpx.Response:
    return await client.post("/v1/live/queue", json={"client_id": device}, headers=who.headers)


async def paired(client: AsyncClient, waiting: Member, joining: Member) -> dict[str, Any]:
    assert (await join(client, waiting, "device-waiting")).json()["state"] == "waiting"
    res = await join(client, joining, "device-joining")
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    assert body["state"] == "paired"
    call: dict[str, Any] = body["call"]
    return call


async def connect(client: AsyncClient, call_id: str, offerer: Member, answerer: Member) -> dict[str, Any]:
    assert (
        await client.put(f"/v1/calls/{call_id}/offer", json={"sdp": OFFER}, headers=offerer.headers)
    ).status_code == 200
    assert (
        await client.put(f"/v1/calls/{call_id}/answer", json={"sdp": ANSWER}, headers=answerer.headers)
    ).status_code == 200
    res = await client.post(f"/v1/calls/{call_id}/connected", headers=offerer.headers)
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


async def give_plan(db: Db, who: Member, now: datetime) -> None:
    await add(
        db,
        Subscription(
            user_id=who.id, provider="razorpay", provider_subscription_id=f"sub_{uuid.uuid4().hex[:12]}",
            status="active", current_end=now + timedelta(days=30), created_at=now, updated_at=now,
        ),
    )  # fmt: skip


async def free_used(db: Db, who: Member) -> int:
    async with db() as s:
        row = await s.get(CallMember, who.id)
        return row.free_calls_used if row else 0


# --- who may call -------------------------------------------------------------------------


async def test_live_screen_and_what_stands_in_the_way(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LIVE-4: rules first, then a ready profile, unpaused; unavailable without a relay."""
    newcomer = await woman(app, db, now, rules=False)
    body = (await client.get("/v1/live", headers=newcomer.headers)).json()
    assert body | {"call": None} == {
        "available": True, "ready": "rules", "rules_version": RULES_VERSION, "rules_accepted": False,
        "free_calls": 5, "free_calls_left": 5, "free_call_seconds": 60, "plan": False, "plan_call_seconds": 600,
        "waiting": False, "call": None, "lgbtq_labels": False, "lgbtq_only": False,
    }  # fmt: skip
    assert (await join(client, newcomer)).json()["code"] == "live_rules"
    stale = await client.put("/v1/live/rules", json={"version": "1999-01"}, headers=newcomer.headers)
    assert (stale.status_code, stale.json()["code"]) == (409, "live_rules_changed")
    ok = await client.put("/v1/live/rules", json={"version": RULES_VERSION}, headers=newcomer.headers)
    assert ok.json()["ready"] == "ok"
    assert ok.json()["rules_accepted"]

    no_photos = await man(app, db, now, photos=("approved", "pending"))
    paused = await man(app, db, now, paused=True)
    for who, code in ((no_photos, "live_profile_incomplete"), (paused, "live_paused")):
        res = await join(client, who)
        assert (res.status_code, res.json()["code"]) == (409, code)

    app.state.ice = NoIce()
    res = await join(client, newcomer)
    assert (res.status_code, res.json()["code"]) == (503, "live_unavailable")
    assert (await client.get("/v1/live", headers=newcomer.headers)).json()["ready"] == "unavailable"


async def test_pairing_is_both_ways(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, published: list[Any]
) -> None:
    """LIVE-5: the longest-waiting suitable member; gender and age both ways; no
    block either way; not the same two again within a day; heartbeats keep places."""
    meera = await woman(app, db, now)
    assert (await join(client, meera, "meera-phone")).json() == {"state": "waiting", "call": None, "retry_after_s": 4}
    assert (await client.get("/v1/live", headers=meera.headers)).json()["waiting"] is True

    other_woman = await woman(app, db, now, interested_in=("woman",))  # suits neither Meera nor the men
    too_young_for_her = await man(app, db, now, age=19)
    she_is_too_old = await man(app, db, now, prefs=(18, 25, None))
    blocked = await man(app, db, now)
    await add(db, Block(blocker_id=meera.id, blocked_id=blocked.id, created_at=now))
    await add(db, Preferences(user_id=meera.id, age_min=21, age_max=35, max_distance_km=None))
    for who in (other_woman, too_young_for_her, she_is_too_old, blocked):
        assert (await join(client, who, "x-device-01")).json()["state"] == "waiting", who

    kabir = await man(app, db, now)
    res = (await join(client, kabir, "kabir-phone")).json()
    assert res["state"] == "paired"
    call = res["call"]
    assert call["role"] == "answerer"
    assert call["client_id"] == "kabir-phone"
    assert call["peer"]["display_name"] == "Meera"
    assert call["peer"]["age"] == 28
    assert set(call["peer"]) == {"user_id", "display_name", "age"}  # nothing else about a stranger
    assert (call["state"], call["limit_s"], call["free"]) == ("connecting", 60, True)
    # Meera is told; her own view names her device and her role.
    assert published[-1] == ({meera.id}, {"type": "call.updated", "call_id": call["id"]})
    mine = (await client.get(f"/v1/calls/{call['id']}", headers=meera.headers)).json()
    assert (mine["role"], mine["client_id"], mine["peer"]["display_name"]) == ("offerer", "meera-phone", "Kabir")
    # Both left the queue; a third person can't see the call.
    async with db() as s:
        waiting = set((await s.execute(select(CallQueueEntry.user_id))).scalars())
    assert meera.id not in waiting
    assert kabir.id not in waiting
    assert (await client.get(f"/v1/calls/{call['id']}", headers=blocked.headers)).status_code == 404
    # Joining again while in a call returns that call.
    again = (await join(client, kabir, "kabir-phone")).json()
    assert again["state"] == "paired"
    assert again["call"]["id"] == call["id"]

    # After the call, the same two aren't paired again within a day.
    await client.post(f"/v1/calls/{call['id']}/end", json={"reason": "next"}, headers=kabir.headers)
    assert (await join(client, meera, "meera-phone")).json()["state"] == "waiting"
    assert (await join(client, kabir, "kabir-phone")).json()["state"] == "waiting"


async def test_stale_and_ineligible_waiters_are_skipped(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """A waiter without a heartbeat for 20 s, or whose last call was used meanwhile, isn't paired."""
    meera = await woman(app, db, now)
    await join(client, meera)
    clock.advance(seconds=25)
    kabir = await man(app, db, clock.now)
    assert (await join(client, kabir)).json()["state"] == "waiting"
    # Meera's heartbeat comes back: she keeps her place and is paired with Kabir.
    assert (await join(client, meera)).json()["state"] == "paired"

    asha = await woman(app, db, clock.now)
    assert (await join(client, asha)).json()["state"] == "waiting"
    async with db() as s:  # her free calls run out while she waits (another device, say)
        row = await s.get(CallMember, asha.id)
        assert row is not None
        row.free_calls_used = 5
        await s.commit()
    raj = await man(app, db, clock.now)
    assert (await join(client, raj)).json()["state"] == "waiting"


async def set_identities(db: Db, who: Member, labels: list[str]) -> None:
    async with db() as s:
        profile = await s.get(Profile, who.id)
        assert profile is not None
        profile.identities = labels
        await s.commit()


async def lgbtq_only(client: AsyncClient, who: Member, on: bool) -> httpx.Response:
    return await client.put("/v1/live/settings", json={"lgbtq_only": on}, headers=who.headers)


async def test_lgbtq_only_is_a_choice_for_members_with_a_label(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    """LIVE-LGBTQ-1 (D161): after the rules; only with a label on your own profile; it applies
    while the label is there and comes back with it; turning it off always works."""
    newcomer = await woman(app, db, now, rules=False, identities=("lesbian",))
    res = await lgbtq_only(client, newcomer, True)
    assert (res.status_code, res.json()["code"]) == (409, "live_rules")

    plain = await woman(app, db, now)
    res = await lgbtq_only(client, plain, True)
    assert (res.status_code, res.json()["code"]) == (409, "live_labels_required")
    body = (await client.get("/v1/live", headers=plain.headers)).json()
    assert (body["lgbtq_labels"], body["lgbtq_only"]) == (False, False)
    assert (await lgbtq_only(client, plain, False)).status_code == 200

    asha = await woman(app, db, now, interested_in=("woman",), identities=("lesbian",))
    before = (await client.get("/v1/live", headers=asha.headers)).json()
    assert (before["lgbtq_labels"], before["lgbtq_only"]) == (True, False)
    res = await lgbtq_only(client, asha, True)
    assert res.status_code == 200, res.text
    assert (res.json()["lgbtq_labels"], res.json()["lgbtq_only"]) == (True, True)

    # Without a label the choice stops applying; with one again, it's back.
    await set_identities(db, asha, [])
    assert (await client.get("/v1/live", headers=asha.headers)).json()["lgbtq_only"] is False
    await set_identities(db, asha, ["queer"])
    assert (await client.get("/v1/live", headers=asha.headers)).json()["lgbtq_only"] is True
    assert (await lgbtq_only(client, asha, False)).json()["lgbtq_only"] is False


async def test_lgbtq_only_pairs_both_ways(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """LIVE-LGBTQ-2 (D161): members in the LGBTQ+ space meet only each other; a label alone puts
    nobody in it, and a choice without a label doesn't apply; everyone else is paired as before
    (the longest wait first)."""

    async def her(name: str, *labels: str) -> Member:
        clock.advance(seconds=1)  # one at a time, so "the longest wait" is clear
        return await woman(app, db, clock.now, interested_in=("woman",), name=name, identities=labels)

    asha = await her("Asha", "lesbian")
    assert (await lgbtq_only(client, asha, True)).status_code == 200
    assert (await join(client, asha, "asha-phone")).json()["state"] == "waiting"
    riya = await her("Riya")  # no label, outside the space: not paired with Asha
    assert (await join(client, riya, "riya-phone")).json()["state"] == "waiting"
    assert (await join(client, asha, "asha-phone")).json()["state"] == "waiting"  # nor on Asha's heartbeat
    zoya = await her("Zoya", "bisexual")  # a label, but she didn't choose the space: paired with Riya
    res = (await join(client, zoya, "zoya-phone")).json()
    assert res["state"] == "paired"
    assert res["call"]["peer"]["display_name"] == "Riya"
    noor = await her("Noor", "queer")  # she chose it too: paired with Asha
    assert (await lgbtq_only(client, noor, True)).status_code == 200
    res = (await join(client, noor, "noor-phone")).json()
    assert res["state"] == "paired"
    assert res["call"]["peer"]["display_name"] == "Asha"

    # A choice without a label doesn't apply: Ira took hers off, and is paired as before.
    tara = await her("Tara")
    assert (await join(client, tara, "tara-phone")).json()["state"] == "waiting"
    ira = await her("Ira", "trans")
    assert (await lgbtq_only(client, ira, True)).status_code == 200
    await set_identities(db, ira, [])
    res = (await join(client, ira, "ira-phone")).json()
    assert res["state"] == "paired"
    assert res["call"]["peer"]["display_name"] == "Tara"


# --- the call's life ----------------------------------------------------------------------


async def test_a_call_from_offer_to_end(
    app: FastAPI, client: AsyncClient, db: Db, *, now: datetime, clock: FrozenClock, published: list[Any]
) -> None:
    """LIVE-6: offer by the waiter, answer by the joiner, each seeing only the
    other's; the first connection report starts a minute's clock and counts the
    free calls once; hanging up clears both descriptions."""
    meera, kabir = await woman(app, db, now), await man(app, db, now)
    call = await paired(client, meera, kabir)
    cid = call["id"]
    wrong = await client.put(f"/v1/calls/{cid}/offer", json={"sdp": OFFER}, headers=kabir.headers)
    assert (wrong.status_code, wrong.json()["code"]) == (409, "not_your_turn")
    early = await client.put(f"/v1/calls/{cid}/answer", json={"sdp": ANSWER}, headers=kabir.headers)
    assert early.json()["code"] == "no_offer_yet"
    early = await client.post(f"/v1/calls/{cid}/connected", headers=meera.headers)
    assert early.json()["code"] == "not_connected_yet"

    assert (await client.put(f"/v1/calls/{cid}/offer", json={"sdp": OFFER}, headers=meera.headers)).status_code == 200
    assert published[-1] == ({kabir.id}, {"type": "call.updated", "call_id": cid})
    seen = (await client.get(f"/v1/calls/{cid}", headers=kabir.headers)).json()
    assert seen["offer_sdp"] == OFFER
    assert seen["answer_sdp"] is None
    again = await client.put(f"/v1/calls/{cid}/offer", json={"sdp": OFFER}, headers=meera.headers)
    assert again.json()["code"] == "offer_sent"
    assert (await client.put(f"/v1/calls/{cid}/answer", json={"sdp": ANSWER}, headers=kabir.headers)).status_code == 200
    mine = (await client.get(f"/v1/calls/{cid}", headers=meera.headers)).json()
    assert mine["answer_sdp"] == ANSWER
    assert mine["offer_sdp"] is None

    clock.advance(seconds=3)
    live = (await client.post(f"/v1/calls/{cid}/connected", headers=kabir.headers)).json()
    assert live["state"] == "live"
    assert datetime.fromisoformat(live["ends_at"]) == clock.now + timedelta(seconds=60)
    assert live["server_now"] == live["connected_at"]
    clock.advance(seconds=1)
    later = (await client.post(f"/v1/calls/{cid}/connected", headers=meera.headers)).json()
    assert later["connected_at"] == live["connected_at"]  # the first report started the clock
    assert (await free_used(db, meera), await free_used(db, kabir)) == (1, 1)  # counted once each

    ended = (await client.post(f"/v1/calls/{cid}/end", json={"reason": "hangup"}, headers=meera.headers)).json()
    assert (ended["state"], ended["end_reason"]) == ("ended", "hangup")
    assert published[-1] == ({kabir.id}, {"type": "call.updated", "call_id": cid})
    twice = (await client.post(f"/v1/calls/{cid}/end", json={"reason": "next"}, headers=kabir.headers)).json()
    assert twice["end_reason"] == "hangup"  # idempotent
    async with db() as s:
        row = await s.get(Call, uuid.UUID(cid))
        assert row is not None
        assert row.offer_sdp is None
        assert row.answer_sdp is None
    assert (await client.post(f"/v1/calls/{cid}/connected", headers=kabir.headers)).json()["code"] == "call_ended"


async def test_relay_only_calls_hand_over_cleaned_descriptions(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    app.state.ice = RelayForTests()
    meera, kabir = await woman(app, db, now), await man(app, db, now)
    cid = (await paired(client, meera, kabir))["id"]
    ice = (await client.post(f"/v1/calls/{cid}/ice", headers=kabir.headers)).json()
    # Credentials last as long as the call may: connecting, a minute, and a margin.
    assert ice == {
        "policy": "relay", "ttl_s": 150,
        "servers": [{"urls": ["turn:relay.example:3478?transport=udp"], "username": "u150", "credential": "c"}],
    }  # fmt: skip
    await client.put(f"/v1/calls/{cid}/offer", json={"sdp": OFFER}, headers=meera.headers)
    seen = (await client.get(f"/v1/calls/{cid}", headers=kabir.headers)).json()["offer_sdp"]
    assert seen == clean_sdp(OFFER, relay_only=True)
    assert HOME_IP not in seen
    assert PUBLIC_IP not in seen
    no_relay = await client.put(
        f"/v1/calls/{cid}/answer", json={"sdp": ANSWER.replace("typ relay", "typ host")}, headers=kabir.headers
    )
    assert (no_relay.status_code, no_relay.json()["code"]) == (422, "invalid_sdp")
    outsider = await man(app, db, now)
    assert (await client.post(f"/v1/calls/{cid}/ice", headers=outsider.headers)).status_code == 404

    app.state.ice = DirectIce()
    direct = (await client.post(f"/v1/calls/{cid}/ice", headers=meera.headers)).json()
    assert (direct["policy"], direct["servers"]) == ("all", [])


async def test_the_clock_and_the_allowance(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """LIVE-7: a minute when either is on a free call; ten when both have the plan;
    time up ends the record at its end; a call that never connects costs nothing;
    five connected calls use the free ones up, and the plan carries on."""
    meera, kabir = await woman(app, db, now), await man(app, db, now)

    # Never connects: ended by the timeout, nothing counted.
    cid = (await paired(client, meera, kabir))["id"]
    clock.advance(seconds=31)
    timed_out = (await client.get(f"/v1/calls/{cid}", headers=meera.headers)).json()
    assert (timed_out["state"], timed_out["end_reason"]) == ("ended", "timeout")
    assert timed_out["ended_at"] == (now + timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
    assert await free_used(db, meera) == 0

    # Connects, and runs out: the server ends it at its end, whatever the devices do.
    others = [await man(app, db, clock.now) for _ in range(5)]
    for i, other in enumerate(others):
        cid = (await paired(client, meera, other))["id"]
        live = await connect(client, cid, meera, other)
        assert live["limit_s"] == 60
        if i == 0:
            clock.advance(seconds=66)
            over = (await client.get(f"/v1/calls/{cid}", headers=other.headers)).json()
            assert (over["state"], over["end_reason"]) == ("ended", "limit")
            assert over["ended_at"] == live["ends_at"]
        else:
            early = (await client.post(f"/v1/calls/{cid}/end", json={"reason": "limit"}, headers=other.headers)).json()
            assert early["end_reason"] == "hangup"  # not the device's to say before the end
        clock.advance(seconds=1)
    assert await free_used(db, meera) == 5
    used_up = await join(client, meera)
    assert (used_up.status_code, used_up.json()["code"]) == (409, "live_no_calls_left")
    assert (await client.get("/v1/live", headers=meera.headers)).json() | {"call": None} == {
        "available": True, "ready": "no_calls_left", "rules_version": RULES_VERSION, "rules_accepted": True,
        "free_calls": 5, "free_calls_left": 0, "free_call_seconds": 60, "plan": False, "plan_call_seconds": 600,
        "waiting": False, "call": None, "lgbtq_labels": False, "lgbtq_only": False,
    }  # fmt: skip

    # With the plan she calls again; with a free caller the call is still a minute,
    # with a plan member ten.
    await give_plan(db, meera, clock.now)
    free_man = await man(app, db, clock.now)
    call = await paired(client, meera, free_man)
    assert (call["limit_s"], call["free"]) == (60, True)
    await client.post(f"/v1/calls/{call['id']}/end", json={"reason": "next"}, headers=free_man.headers)
    plan_man = await man(app, db, clock.now)
    await give_plan(db, plan_man, clock.now)
    call = await paired(client, meera, plan_man)
    assert (call["limit_s"], call["free"]) == (600, False)
    await connect(client, call["id"], meera, plan_man)
    assert await free_used(db, meera) == 5
    assert await free_used(db, plan_man) == 0


# --- safety -------------------------------------------------------------------------------


async def test_a_report_from_a_call_holds_live(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LIVE-8: a report names the call; the reported member waits for staff
    before using Live again; a call between other people can't be named."""
    staff = await make_member(db, app.state.storage, now, role="moderator", profile=False, session_client="web_admin")
    meera, kabir = await woman(app, db, now), await man(app, db, now)
    cid = (await paired(client, meera, kabir))["id"]
    await connect(client, cid, meera, kabir)
    await client.post(f"/v1/calls/{cid}/end", json={"reason": "report"}, headers=meera.headers)
    res = await client.post(
        "/v1/reports", json={"subject_id": str(kabir.id), "reason": "explicit", "call_id": cid}, headers=meera.headers
    )
    assert res.status_code == 201, res.text
    assert res.json()["about"] == "call"
    held = await join(client, kabir)
    assert (held.status_code, held.json()["code"]) == (409, "live_on_hold")
    # The reporter blocked him (the default): never paired again.
    async with db() as s:
        assert await s.get(Block, (meera.id, kabir.id)) is not None

    stranger = await woman(app, db, now)
    wrong = await client.post(
        "/v1/reports", json={"subject_id": str(kabir.id), "reason": "other", "call_id": cid}, headers=stranger.headers
    )
    assert wrong.status_code in (404, 422)
    both = await client.post(
        "/v1/reports",
        json={"subject_id": str(kabir.id), "reason": "other", "call_id": cid, "photo_id": str(kabir.photo_ids[0])},
        headers=meera.headers,
    )
    assert both.status_code == 422

    # Staff see the call's facts and decide; dismissing releases the hold.
    report_id = res.json()["id"]
    detail = (await client.get(f"/v1/admin/reports/{report_id}", headers=staff.headers)).json()
    assert detail["call_started_at"] is not None
    assert detail["call_seconds"] == 0
    queue = (await client.get("/v1/admin/reports", headers=staff.headers)).json()
    assert any(item["about"] == "call" for item in queue)
    done = await client.post(
        f"/v1/admin/reports/{report_id}/actions", json={"action": "dismiss"}, headers=staff.headers
    )
    assert done.status_code == 201, done.text
    assert (await join(client, kabir)).json()["state"] == "waiting"


async def test_a_like_after_a_call(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """LIVE-9: two people who met in a call can like each other for a day: a match."""
    meera, kabir = await woman(app, db, now), await man(app, db, now)
    stranger = await man(app, db, now)
    cid = (await paired(client, meera, kabir))["id"]
    # Before it connects, a like isn't possible.
    early = await client.post(
        "/v1/interactions", json={"target_id": str(kabir.id), "kind": "like"}, headers=meera.headers
    )
    assert early.status_code == 404
    await connect(client, cid, meera, kabir)
    await client.post(f"/v1/calls/{cid}/end", json={"reason": "hangup"}, headers=kabir.headers)
    first = await client.post(
        "/v1/interactions", json={"target_id": str(kabir.id), "kind": "like"}, headers=meera.headers
    )
    assert first.status_code == 201
    assert first.json()["match"] is None
    second = await client.post(
        "/v1/interactions", json={"target_id": str(meera.id), "kind": "like"}, headers=kabir.headers
    )
    assert second.status_code == 201
    assert second.json()["match"] is not None
    nobody = await client.post(
        "/v1/interactions", json={"target_id": str(stranger.id), "kind": "like"}, headers=meera.headers
    )
    assert nobody.status_code == 404

    # A day after the connection, the window has closed.
    late_a, late_b = await woman(app, db, now), await man(app, db, now)
    cid = (await paired(client, late_a, late_b))["id"]
    await connect(client, cid, late_a, late_b)
    clock.advance(hours=24, seconds=1)
    late = await client.post(
        "/v1/interactions", json={"target_id": str(late_b.id), "kind": "like"}, headers=late_a.headers
    )
    assert late.status_code == 404
    async with db() as s:
        assert len((await s.execute(select(Match))).scalars().all()) == 1


async def test_leaving_and_retention(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """LIVE-10: an account that goes away ends its calls and leaves the queue; call
    records are purged after 90 days unless an open report names them."""
    meera, kabir = await woman(app, db, now), await man(app, db, now)
    cid = (await paired(client, meera, kabir))["id"]
    await connect(client, cid, meera, kabir)
    async with db() as s:
        from app.modules.calls.service import end_all_for  # noqa: PLC0415

        assert await end_all_for(s, kabir.id, clock.now) == [meera.id]
        await s.commit()
    ended = (await client.get(f"/v1/calls/{cid}", headers=meera.headers)).json()
    assert (ended["state"], ended["end_reason"]) == ("ended", "left")

    asha, reported = await woman(app, db, now), await man(app, db, now)
    reported_cid = (await paired(client, asha, reported))["id"]
    await client.post(f"/v1/calls/{reported_cid}/end", json={"reason": "report"}, headers=asha.headers)
    rep = await client.post(
        "/v1/reports",
        json={"subject_id": str(reported.id), "reason": "harassment", "call_id": reported_cid},
        headers=asha.headers,
    )
    assert rep.status_code == 201, rep.text

    await join(client, await woman(app, db, now))  # a waiter who then goes quiet
    clock.advance(days=91)
    async with db() as s:
        counts = await privacy.sweep(s, app.state.settings, clock.now)
    assert counts["calls"] == 1  # the reported call stays
    assert counts["call_queue"] == 1
    async with db() as s:
        left = {c.id for c in (await s.execute(select(Call))).scalars()}
    assert left == {uuid.UUID(reported_cid)}


# --- concurrency -------------------------------------------------------------------------


@pytest.fixture
def scratch_settings(base_settings: Settings) -> Iterator[Settings]:
    with scratch_database(base_settings, "datingapp_calls_test") as settings:
        yield settings.model_copy(update={"calls_ice": "direct"})


@pytest.fixture
async def committed(scratch_settings: Settings) -> AsyncIterator[FastAPI]:
    async with committed_app(scratch_settings) as application:
        yield application


ROUNDS = 25


async def test_simultaneous_joins_pair_exactly_once(committed: FastAPI) -> None:
    """LIVE-11: two people joining at the same moment are paired once, never
    missed (both left waiting) and never doubled, on real connections."""
    db: Db = committed.state.session_factory
    now = datetime.now().astimezone()
    pairs = []
    for _ in range(ROUNDS):
        a = await member(committed, db, now, gender="woman", interested_in=("man",))
        b = await member(committed, db, now, gender="man", interested_in=("woman",))
        pairs.append((a, b))
    async with AsyncClient(transport=ASGITransport(app=committed), base_url="http://testserver") as c:
        for a, b in pairs:
            ra, rb = await asyncio.gather(join(c, a, "device-a-0001"), join(c, b, "device-b-0001"))
            states = sorted(r.json()["state"] for r in (ra, rb))
            assert states == ["paired", "waiting"], (ra.text, rb.text)
    async with db() as s:
        calls = (await s.execute(select(Call))).scalars().all()
        waiting = (await s.execute(select(CallQueueEntry))).scalars().all()
    assert len(calls) == ROUNDS
    assert not waiting
    assert {frozenset((c.user_a_id, c.user_b_id)) for c in calls} == {frozenset((a.id, b.id)) for a, b in pairs}
