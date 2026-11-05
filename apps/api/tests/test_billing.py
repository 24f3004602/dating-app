"""The plan's server side (stage 16b, D094), sandbox only: live keys refused,
checkout, signed and deduplicated webhooks, out-of-order events, entitlement,
cancel at the end of the paid period, deletion stops charges, and the Razorpay
adapter against a fake server."""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select

from app.config import Settings
from app.modules.billing.models import PaymentEvent
from app.modules.privacy import service as privacy
from app.providers.payments import FakePayments, PaymentsUnavailableError, RazorpayPayments, razorpay_signature
from tests.chat import Db
from tests.members import Member, add, make_member
from tests.support import PASSWORD, FrozenClock, JobRunner
from tests.test_privacy import deletable


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")
    return clock.now


@pytest.fixture
def payments(app: FastAPI) -> FakePayments:
    fake = FakePayments()
    app.state.payments = fake
    return fake


def event(name: str, sub_id: str, status: str, *, at: datetime, current_end: datetime | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {"id": sub_id, "entity": "subscription", "status": status, "plan_id": "plan_x"}
    entity["current_end"] = int(current_end.timestamp()) if current_end else None
    return {
        "entity": "event", "event": name, "contains": ["subscription"],
        "payload": {"subscription": {"entity": entity}}, "created_at": int(at.timestamp()),
    }  # fmt: skip


async def deliver(
    client: AsyncClient, body: dict[str, Any] | bytes, event_id: str, *, secret: str = FakePayments.secret
) -> httpx.Response:
    raw = body if isinstance(body, bytes) else json.dumps(body, separators=(",", ":")).encode()
    headers = {"x-razorpay-signature": razorpay_signature(secret, raw), "x-razorpay-event-id": event_id,
               "content-type": "application/json"}  # fmt: skip
    return await client.post("/v1/webhooks/razorpay", content=raw, headers=headers)


async def plan(client: AsyncClient, who: Member) -> dict[str, Any]:
    body: dict[str, Any] = (await client.get("/v1/me/subscription", headers=who.headers)).json()
    return body


# --- guards ----------------------------------------------------------------------------


def test_live_keys_need_the_owners_authorization(base_settings: Settings) -> None:
    values = base_settings.model_dump()
    with pytest.raises(ValidationError, match="live Razorpay keys need PAYMENTS_LIVE=true"):
        Settings.model_validate({**values, "razorpay_key_id": "rzp_live_abc"})
    Settings.model_validate({**values, "razorpay_key_id": "rzp_live_abc", "payments_live": True})  # authorized
    with pytest.raises(ValidationError, match="needs a key ID, key secret, webhook secret and plan ID"):
        Settings.model_validate({**values, "payments_backend": "razorpay", "razorpay_key_id": "rzp_test_x"})


async def test_without_payments_set_up_checkout_says_so_and_webhooks_are_refused(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    r = await client.post("/v1/me/subscription", headers=asha.headers)
    assert (r.status_code, r.json()["code"]) == (503, "payments_unavailable")
    assert await plan(client, asha) == {"status": "none", "entitled": False, "paid_until": None, "renews": False}
    r = await deliver(client, event("subscription.activated", "sub_x", "active", at=now), "evt_1")
    assert (r.status_code, r.json()["code"]) == (400, "invalid_signature")


# --- the lifecycle -----------------------------------------------------------------------


async def test_a_subscription_from_checkout_to_cancelled(
    app: FastAPI, client: AsyncClient, db: Db, *, payments: FakePayments, clock: FrozenClock, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    r = await client.post("/v1/me/subscription", headers=asha.headers)
    assert r.status_code == 201, r.text
    assert r.json() == {"subscription_id": "sub_fake000001", "key_id": "rzp_test_fake"}
    assert (await plan(client, asha))["status"] == "created"
    assert (await plan(client, asha))["entitled"] is False  # nothing paid yet

    paid_until = now + timedelta(days=7)  # a weekly plan keeps the session alive
    r = await deliver(
        client, event("subscription.activated", "sub_fake000001", "active", at=now, current_end=paid_until), "evt_1"
    )
    assert r.json() == {"outcome": "applied"}
    mine = await plan(client, asha)
    assert (mine["status"], mine["entitled"], mine["renews"]) == ("active", True, True)
    assert datetime.fromisoformat(mine["paid_until"]) == paid_until
    r = await client.post("/v1/me/subscription", headers=asha.headers)
    assert (r.status_code, r.json()["code"]) == (409, "already_subscribed")

    # Delivered twice: applied once. An older event arriving late: ignored.
    assert (
        await deliver(client, event("subscription.activated", "sub_fake000001", "active", at=now), "evt_1")
    ).json() == {"outcome": "duplicate"}
    late = event("subscription.pending", "sub_fake000001", "pending", at=now - timedelta(minutes=5))
    assert (await deliver(client, late, "evt_0")).json() == {"outcome": "stale"}
    assert (await plan(client, asha))["status"] == "active"

    # Cancel: no more renewals, the paid period is honoured.
    r = await client.post("/v1/me/subscription/cancel", headers=asha.headers)
    assert (r.status_code, r.json()["renews"], r.json()["entitled"]) == (200, False, True)
    assert payments.cancelled == [("sub_fake000001", True)]
    assert (await client.post("/v1/me/subscription/cancel", headers=asha.headers)).status_code == 200
    assert payments.cancelled == [("sub_fake000001", True)]  # asked once
    clock.advance(days=7, seconds=1)
    ended = event("subscription.cancelled", "sub_fake000001", "cancelled", at=clock(), current_end=paid_until)
    assert (await deliver(client, ended, "evt_2")).json() == {"outcome": "applied"}
    mine = await plan(client, asha)
    assert (mine["status"], mine["entitled"], mine["renews"]) == ("cancelled", False, False)
    r = await client.post("/v1/me/subscription/cancel", headers=asha.headers)
    assert (r.status_code, r.json()["code"]) == (409, "nothing_to_cancel")


async def test_a_failed_renewal_keeps_what_was_paid_then_ends(
    app: FastAPI, client: AsyncClient, db: Db, *, payments: FakePayments, clock: FrozenClock, now: datetime
) -> None:
    asha = await make_member(db, app.state.storage, now)
    await client.post("/v1/me/subscription", headers=asha.headers)
    sub = payments.created[0]
    paid_until = now + timedelta(days=30)
    await deliver(client, event("subscription.activated", sub, "active", at=now, current_end=paid_until), "e1")
    clock.advance(days=29)
    await deliver(client, event("subscription.pending", sub, "pending", at=clock()), "e2")  # a charge failed; retrying
    assert (await plan(client, asha))["entitled"] is True
    clock.advance(days=3)
    await deliver(client, event("subscription.halted", sub, "halted", at=clock()), "e3")
    assert (await plan(client, asha))["entitled"] is False  # the paid period is over


async def test_webhooks_check_the_signature_over_the_raw_body_first(
    app: FastAPI, client: AsyncClient, db: Db, *, payments: FakePayments, now: datetime
) -> None:
    body = event("subscription.activated", "sub_x", "active", at=now)
    raw = json.dumps(body).encode()
    good = razorpay_signature(payments.secret, raw)
    forged = razorpay_signature("another-secret", raw)
    for headers, code in (
        ({"x-razorpay-signature": good, "x-razorpay-event-id": "e1"}, None),
        ({"x-razorpay-signature": forged, "x-razorpay-event-id": "e2"}, "invalid_signature"),
        ({"x-razorpay-event-id": "e3"}, "invalid_signature"),
        ({"x-razorpay-signature": good}, "invalid_webhook"),
    ):  # fmt: skip
        r = await client.post("/v1/webhooks/razorpay", content=raw, headers=headers)
        if code is None:
            assert r.json() == {"outcome": "unknown"}  # signed, but not a subscription we created
        else:
            assert (r.status_code, r.json()["code"]) == (400, code)
    # The same JSON re-serialised (other spacing) no longer matches: the raw bytes are what is signed.
    respaced = json.dumps(body, indent=2).encode()
    r = await client.post(
        "/v1/webhooks/razorpay", content=respaced, headers={"x-razorpay-signature": good, "x-razorpay-event-id": "e4"}
    )
    assert r.json()["code"] == "invalid_signature"
    other = {"entity": "event", "event": "payment.captured", "payload": {}, "created_at": int(now.timestamp())}
    assert (await deliver(client, other, "e5")).json() == {"outcome": "ignored"}
    assert (await deliver(client, b"not json", "e6")).json()["code"] == "invalid_webhook"


async def test_deleting_the_account_stops_charges_at_once(
    app: FastAPI, client: AsyncClient, db: Db, *, payments: FakePayments, jobs: JobRunner, now: datetime
) -> None:
    asha = await deletable(app, db, await make_member(db, app.state.storage, now))
    await client.post("/v1/me/subscription", headers=asha.headers)
    sub = payments.created[0]
    await deliver(
        client, event("subscription.activated", sub, "active", at=now, current_end=now + timedelta(days=30)), "e1"
    )
    assert (await client.post("/v1/me/deletion", json={"password": PASSWORD}, headers=asha.headers)).status_code == 202
    await jobs.run()
    assert jobs.payments.cancelled == [(sub, False)]  # immediately, not at the end of the cycle


async def test_old_payment_events_are_forgotten_after_90_days(app: FastAPI, db: Db, now: datetime) -> None:
    await add(
        db,
        PaymentEvent(
            provider="razorpay", event_id="old", event="subscription.charged", received_at=now - timedelta(days=91)
        ),
        PaymentEvent(
            provider="razorpay", event_id="new", event="subscription.charged", received_at=now - timedelta(days=89)
        ),
    )
    async with db() as s:
        assert (await privacy.sweep(s, app.state.settings, now))["payment_events"] == 1
    async with db() as s:
        assert (await s.execute(select(PaymentEvent.event_id))).scalars().all() == ["new"]


# --- the Razorpay adapter, against a fake server ----------------------------------------------


async def test_the_razorpay_adapter_calls_the_documented_endpoints() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/cancel"):
            return httpx.Response(200, json={"id": "sub_1", "status": "cancelled"})
        return httpx.Response(200, json={"id": "sub_1", "status": "created", "short_url": "https://rzp.io/i/x"})

    rp = RazorpayPayments(
        "rzp_test_key", "key-secret", "hook-secret", "plan_123", transport=httpx.MockTransport(handler)
    )
    created = await rp.create_subscription()
    assert (created.id, created.short_url) == ("sub_1", "https://rzp.io/i/x")
    await rp.cancel("sub_1", at_cycle_end=True)
    assert [(r.method, str(r.url)) for r in seen] == [
        ("POST", "https://api.razorpay.com/v1/subscriptions"),
        ("POST", "https://api.razorpay.com/v1/subscriptions/sub_1/cancel"),
    ]
    assert json.loads(seen[0].content) == {"plan_id": "plan_123", "total_count": 120}
    assert json.loads(seen[1].content) == {"cancel_at_cycle_end": True}
    expected = "Basic " + base64.b64encode(b"rzp_test_key:key-secret").decode()
    assert seen[0].headers["authorization"] == expected
    raw = b'{"event":"subscription.charged"}'
    assert rp.verify(raw, razorpay_signature("hook-secret", raw))
    assert not rp.verify(raw + b" ", razorpay_signature("hook-secret", raw))
    assert not rp.verify(raw, "")
    await rp.aclose()

    for status in (429, 502):
        down = RazorpayPayments(
            "k", "s", "h", "p", transport=httpx.MockTransport(lambda r, s=status: httpx.Response(s))
        )
        with pytest.raises(PaymentsUnavailableError):  # retried by the job
            await down.cancel("sub_1", at_cycle_end=False)
    wrong = RazorpayPayments("k", "s", "h", "p", transport=httpx.MockTransport(lambda r: httpx.Response(400, json={})))
    with pytest.raises(httpx.HTTPStatusError):  # our request is wrong: not retried
        await wrong.create_subscription()
