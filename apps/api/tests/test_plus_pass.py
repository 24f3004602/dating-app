"""The Plus pass, paid by UPI (D127): settings that refuse to take money without
the owner's go, the payment link and its code, the UPI reference sent once,
expiry, the admin's check against the bank, passes that extend and end,
references that can't buy twice, and records kept for accounting without the
member's account."""

from __future__ import annotations

import base64
import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.billing import passes
from app.modules.billing import service as billing
from app.modules.billing.models import PlusPayment, PlusPaymentStatus
from app.modules.privacy import retention
from app.modules.privacy import service as privacy
from app.providers.ice import DirectIce
from app.providers.payments import PassPrice, UpiPayee, UpiPayments
from tests.chat import Db
from tests.members import Member, add, make_member
from tests.support import FrozenClock

VPA = "kinaara.plus@example"
PAYEE = "Kinaara Test"
UTR = "612345678901"


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-19T09:00:00+00:00")
    return clock.now


@pytest.fixture
def upi(app: FastAPI) -> UpiPayments:
    provider = UpiPayments(payee=UpiPayee(VPA, PAYEE), price=PassPrice(29900, "INR", 30))
    app.state.payments = provider
    return provider


async def admin(app: FastAPI, db: Db, now: datetime, role: str = "admin") -> Member:
    return await make_member(db, app.state.storage, now, role=role, profile=False, session_client="web_admin")


async def start(client: AsyncClient, who: Member) -> dict[str, Any]:
    r = await client.post("/v1/me/plus-payment", headers=who.headers)
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


async def send(client: AsyncClient, who: Member, payment_id: str, utr: str = UTR) -> Any:
    return await client.put(f"/v1/me/plus-payment/{payment_id}/reference", json={"utr": utr}, headers=who.headers)


async def decide(client: AsyncClient, staff: Member, payment_id: str, decision: str, reason: str | None = None) -> Any:
    body: dict[str, Any] = {"decision": decision} | ({"reason": reason} if reason else {})
    return await client.post(f"/v1/admin/plus-payments/{payment_id}/decision", json=body, headers=staff.headers)


async def mine(client: AsyncClient, who: Member) -> dict[str, Any]:
    body: dict[str, Any] = (await client.get("/v1/me/subscription", headers=who.headers)).json()
    return body


async def audited(db: Db, action: str) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).where(AuditLog.action == action))).scalar_one())


# --- settings -------------------------------------------------------------------------------


def test_the_pass_takes_money_only_with_the_owners_go(base_settings: Settings) -> None:
    """PLUS-1: UPI needs the payee and PAYMENTS_LIVE; the beta allows live payments for the pass only."""
    values = base_settings.model_dump()
    upi = {**values, "payments_backend": "upi", "upi_payee_vpa": VPA, "upi_payee_name": PAYEE}
    with pytest.raises(ValidationError, match="needs UPI_PAYEE_VPA and UPI_PAYEE_NAME"):
        Settings.model_validate({**values, "payments_backend": "upi", "payments_live": True})
    with pytest.raises(ValidationError, match="takes real money: it needs PAYMENTS_LIVE=true"):
        Settings.model_validate(upi)
    for bad in ("no-at-sign", "x@", "a b@example", "name@ok axis"):
        with pytest.raises(ValidationError):
            Settings.model_validate({**upi, "payments_live": True, "upi_payee_vpa": bad})
    ok = Settings.model_validate({**upi, "payments_live": True, "upi_payee_vpa": "", "upi_payee_name": PAYEE} | {
        "upi_payee_vpa": VPA})  # fmt: skip
    assert (ok.plus_price_inr, ok.plus_pass_days) == (299, 30)


# --- paying -------------------------------------------------------------------------------


async def test_without_the_pass_set_up_nothing_is_sold(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    """PLUS-2: the default sells nothing: no payment to start, nothing in progress."""
    asha = await make_member(db, app.state.storage, now)
    assert (await client.get("/v1/me/plus-payment", headers=asha.headers)).json() is None
    r = await client.post("/v1/me/plus-payment", headers=asha.headers)
    assert (r.status_code, r.json()["code"]) == (503, "payments_unavailable")
    assert (await client.get("/v1/plan", headers=asha.headers)).json()["available"] is False


async def test_a_payment_to_make(app: FastAPI, client: AsyncClient, db: Db, now: datetime, upi: UpiPayments) -> None:
    """PLUS-3: the price, the payee and a code, as a UPI link and its QR; a second tap gives the same payment."""
    asha = await make_member(db, app.state.storage, now)
    plan = (await client.get("/v1/plan", headers=asha.headers)).json()
    assert plan == {"available": True, "kind": "pass", "amount": 29900, "currency": "INR", "period": None,
                    "interval": None, "days": 30}  # fmt: skip

    p = await start(client, asha)
    code = p["code"]
    assert len(code) == 8
    assert set(code) <= set(passes.CODE_ALPHABET)
    brand = app.state.settings.brand_name.replace(" ", "%20")
    assert p["upi_url"] == f"upi://pay?pa={VPA}&pn=Kinaara%20Test&am=299.00&cu=INR&tn={brand}%20Plus%20{code}"
    assert p["qr"].startswith("data:image/png;base64,")
    assert base64.b64decode(p["qr"].split(",", 1)[1])[:8] == b"\x89PNG\r\n\x1a\n"
    assert {k: p[k] for k in ("status", "amount", "currency", "days", "payee_vpa", "payee_name", "utr")} == {
        "status": "open", "amount": 29900, "currency": "INR", "days": 30, "payee_vpa": VPA, "payee_name": PAYEE,
        "utr": None,
    }  # fmt: skip
    assert datetime.fromisoformat(p["open_until"]) == now + passes.OPEN_FOR
    assert (await start(client, asha))["id"] == p["id"]  # the same open payment
    assert (await client.get("/v1/me/plus-payment", headers=asha.headers)).json()["id"] == p["id"]
    assert await audited(db, "billing.plus_payment_started") == 1


async def test_the_reference_is_sent_once_and_never_twice(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-4: twelve digits; once per payment; one reference can't back two payments; others' payments are 404."""
    asha = await make_member(db, app.state.storage, now)
    ravi = await make_member(db, app.state.storage, now)
    p = await start(client, asha)
    for bad in ("61234567890", "6123456789012", "61234567890a", ""):
        assert (await send(client, asha, p["id"], bad)).status_code == 422
    assert (await send(client, ravi, p["id"])).status_code == 404  # not his

    sent = await send(client, asha, p["id"])
    assert sent.status_code == 200, sent.text
    assert {k: sent.json()[k] for k in ("status", "utr", "qr")} == {"status": "submitted", "utr": UTR, "qr": None}
    again = await send(client, asha, p["id"], "612345678902")
    assert (again.status_code, again.json()["code"]) == (409, "payment_closed")
    busy = await client.post("/v1/me/plus-payment", headers=asha.headers)
    assert (busy.status_code, busy.json()["code"]) == (409, "payment_pending")

    q = await start(client, ravi)
    reused = await send(client, ravi, q["id"])  # Asha's reference
    assert (reused.status_code, reused.json()["code"]) == (409, "reference_used")
    assert await audited(db, "billing.plus_reference_sent") == 1


async def test_an_unpaid_payment_runs_out(
    app: FastAPI, client: AsyncClient, db: Db, *, clock: FrozenClock, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-5: 48 hours to pay and send the reference; then a new payment with a new code."""
    asha = await make_member(db, app.state.storage, now)
    p = await start(client, asha)
    clock.now = now + passes.OPEN_FOR
    late = await send(client, asha, p["id"])
    assert (late.status_code, late.json()["code"]) == (409, "payment_expired")
    assert (await client.get("/v1/me/plus-payment", headers=asha.headers)).json() is None
    fresh = await start(client, asha)
    assert fresh["id"] != p["id"]
    assert fresh["code"] != p["code"]


# --- the admin's check ---------------------------------------------------------------------


async def test_only_admins_check_payments(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-6: members' sessions and moderators are refused; admins see codes, amounts and references only."""
    asha = await make_member(db, app.state.storage, now)
    p = await start(client, asha)
    await send(client, asha, p["id"])
    moderator = await admin(app, db, now, role="moderator")
    assert (await client.get("/v1/admin/plus-payments", headers=asha.headers)).status_code == 401
    assert (await client.get("/v1/admin/plus-payments", headers=moderator.headers)).status_code == 403
    assert (await decide(client, moderator, p["id"], "approve")).status_code == 403

    boss = await admin(app, db, now)
    listed = (await client.get("/v1/admin/plus-payments", headers=boss.headers)).json()
    assert [row["id"] for row in listed] == [p["id"]]
    assert set(listed[0]) == {"id", "code", "status", "amount", "currency", "days", "utr", "created_at",
                              "submitted_at", "decided_at", "reject_reason", "plus_until"}  # fmt: skip
    assert listed[0]["utr"] == UTR
    assert await audited(db, "admin.plus_payments_viewed") == 1


async def test_an_approved_payment_is_the_pass(
    app: FastAPI, client: AsyncClient, db: Db, *, clock: FrozenClock, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-7: the pass starts at approval, brings Live's plan, extends from its end, and ends on its own."""
    app.state.ice = DirectIce()
    asha = await make_member(db, app.state.storage, now)
    boss = await admin(app, db, now)
    assert (await mine(client, asha))["status"] == "none"
    p = await start(client, asha)
    await send(client, asha, p["id"])
    ok = await decide(client, boss, p["id"], "approve")
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "approved"
    first_end = now + timedelta(days=30)
    assert datetime.fromisoformat(ok.json()["plus_until"]) == first_end
    assert await mine(client, asha) == {"status": "active", "entitled": True,
                                        "paid_until": first_end.isoformat().replace("+00:00", "Z"),
                                        "renews": False}  # fmt: skip
    assert (await client.get("/v1/live", headers=asha.headers)).json()["plan"] is True
    twice = await decide(client, boss, p["id"], "approve")
    assert (twice.status_code, twice.json()["code"]) == (409, "already_decided")
    seen = (await client.get("/v1/me/plus-payment", headers=asha.headers)).json()
    assert (seen["status"], seen["qr"]) == ("approved", None)

    clock.now = now + timedelta(days=10)  # a second pass while the first runs
    q = await start(client, asha)
    await send(client, asha, q["id"], "612345678902")
    boss = await admin(app, db, clock.now)  # staff sessions last 12 hours
    second = await decide(client, boss, q["id"], "approve")
    assert second.status_code == 200, second.text
    assert datetime.fromisoformat(second.json()["plus_until"]) == first_end + timedelta(days=30)

    async with db() as s:  # members' sessions end before these days come: ask the service
        after_first = first_end + timedelta(days=1)  # the first has ended; the second runs
        assert await billing.has_plan(s, asha.id, after_first) is True
        assert (await billing.my_subscription(s, asha.id, after_first)).paid_until == first_end + timedelta(days=30)
        all_over = first_end + timedelta(days=30)
        assert await billing.has_plan(s, asha.id, all_over) is False
        assert (await billing.my_subscription(s, asha.id, all_over)).status == "none"
    assert await audited(db, "admin.plus_payment_decided") == 2


async def test_a_rejected_payment_frees_its_reference(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-8: a rejection needs a reason, shows it to the member, and the same reference can be sent again."""
    asha = await make_member(db, app.state.storage, now)
    boss = await admin(app, db, now)
    p = await start(client, asha)
    await send(client, asha, p["id"])
    assert (await decide(client, boss, p["id"], "reject")).status_code == 422  # no reason
    assert (await decide(client, boss, p["id"], "approve", "other")).status_code == 422
    no = await decide(client, boss, p["id"], "reject", "not_found")
    assert (no.json()["status"], no.json()["reject_reason"]) == ("rejected", "not_found")
    seen = (await client.get("/v1/me/plus-payment", headers=asha.headers)).json()
    assert (seen["status"], seen["reject_reason"]) == ("rejected", "not_found")
    assert (await mine(client, asha))["entitled"] is False
    late = await decide(client, boss, p["id"], "approve")
    assert (late.status_code, late.json()["code"]) == (409, "already_decided")

    q = await start(client, asha)
    assert (await send(client, asha, q["id"])).status_code == 200  # the same reference, now on the new payment


async def test_one_bank_payment_never_backs_two_passes(app: FastAPI, db: Db, now: datetime) -> None:
    """PLUS-9: the database refuses a reference held twice (pending or approved), whatever the code does."""
    a = await make_member(db, app.state.storage, now)
    b = await make_member(db, app.state.storage, now)

    def row(user: uuid.UUID, code: str, status: PlusPaymentStatus, **kw: Any) -> PlusPayment:
        return PlusPayment(user_id=user, code=code, amount=29900, currency="INR", days=30, status=status,
                           created_at=now, **kw)  # fmt: skip

    await add(db, row(a.id, "AAAAAAAA", PlusPaymentStatus.rejected, utr=UTR, submitted_at=now, decided_at=now,
                      reject_reason="not_found"))  # fmt: skip
    await add(db, row(b.id, "BBBBBBBB", PlusPaymentStatus.submitted, utr=UTR, submitted_at=now))
    with pytest.raises(IntegrityError):
        await add(db, row(a.id, "CCCCCCCC", PlusPaymentStatus.submitted, utr=UTR, submitted_at=now))


async def test_staff_never_decide_their_own_and_records_outlive_the_account(
    app: FastAPI, client: AsyncClient, db: Db, *, clock: FrozenClock, now: datetime, upi: UpiPayments
) -> None:
    """PLUS-10: no deciding your own payment; a deleted member's records stay, unlinked; retention."""
    boss = await admin(app, db, now)
    other = await admin(app, db, now)
    await add(db, PlusPayment(user_id=boss.id, code="OWNPAY22", amount=29900, currency="INR", days=30,
                              status=PlusPaymentStatus.submitted, utr="699999999999", submitted_at=now,
                              created_at=now))  # fmt: skip
    async with db() as s:
        own = (await s.execute(select(PlusPayment.id).where(PlusPayment.code == "OWNPAY22"))).scalar_one()
    mine_too = await decide(client, boss, str(own), "approve")
    assert (mine_too.status_code, mine_too.json()["code"]) == (409, "own_account")

    asha = await make_member(db, app.state.storage, now)
    p = await start(client, asha)
    await send(client, asha, p["id"])
    async with db() as s:
        await s.execute(delete(User).where(User.id == asha.id))  # the purge, as the deletion job does it
        await s.commit()
        left = await s.get(PlusPayment, uuid.UUID(p["id"]))
        assert left is not None
        assert (left.user_id, left.utr) == (None, UTR)
    gone = await decide(client, other, p["id"], "approve")
    assert (gone.status_code, gone.json()["code"]) == (409, "member_gone")
    assert (await decide(client, other, p["id"], "reject", "other")).status_code == 200

    # Unpaid attempts go after a month; payment records after the accounting period.
    ravi = await make_member(db, app.state.storage, now)
    unpaid = await start(client, ravi)
    clock.now = now + retention.UNPAID_PLUS_PAYMENT + timedelta(minutes=1)
    async with db() as s:
        counts = await privacy.sweep(s, app.state.settings, clock())
    assert counts["plus_payments"] == 1
    async with db() as s:
        assert await s.get(PlusPayment, uuid.UUID(unpaid["id"])) is None
        assert await s.get(PlusPayment, uuid.UUID(p["id"])) is not None  # decided: an accounting record
    clock.now = now + retention.PLUS_PAYMENT_RECORD + timedelta(minutes=1)
    async with db() as s:
        assert (await privacy.sweep(s, app.state.settings, clock()))["plus_payments"] == 2
