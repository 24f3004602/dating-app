"""Payments behind an interface (CLAUDE.md: a payment-provider abstraction; D094).

- `NoPayments` (default): checkouts are refused; webhooks are refused.
- `FakePayments` (tests): records calls, signs like Razorpay with a test secret.
- `RazorpayPayments`: Razorpay's Subscriptions API (docs read 2026-11-05):
  POST https://api.razorpay.com/v1/subscriptions {plan_id, total_count} and
  POST .../subscriptions/{id}/cancel {cancel_at_cycle_end}, with HTTP Basic
  auth (key ID and secret). The price shown to members is read from the plan
  itself (GET .../plans/{id}: `item.amount` in paise, `item.currency`,
  `period`, `interval`; plan entity docs read 2026-11-18), so what the app
  shows is what Razorpay charges. Webhooks carry `X-Razorpay-Signature`, an
  HMAC-SHA256 of the raw body under the webhook secret. Tested against a fake
  server and our own secret, not against Razorpay.

Nothing about the member is sent to Razorpay: we keep the link between our
user and their subscription ID ourselves.

- `UpiPayments` (D127, the owner's choice 2026-11-19): no provider at all. The
  Plus pass is paid by UPI straight to the operator's UPI ID (a `upi://pay`
  link and its QR code, the NPCI linking format), and an admin confirms each
  payment against the bank account (billing/passes.py). Nothing renews; there
  are no webhooks and no keys.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.config import Settings

API = "https://api.razorpay.com/v1"
# Razorpay requires a count of billing cycles; ten years of monthly cycles,
# cancellable at any time.
TOTAL_COUNT = 120


# How long a plan's price is remembered before it is read again.
PRICE_TTL_S = 600


@dataclass(frozen=True)
class CreatedSubscription:
    id: str
    short_url: str | None


@dataclass(frozen=True)
class PlanPrice:
    amount: int  # in the currency's smallest unit (paise)
    currency: str
    period: str  # daily, weekly, monthly, quarterly or yearly
    interval: int


@dataclass(frozen=True)
class PassPrice:
    amount: int  # paise
    currency: str
    days: int


@dataclass(frozen=True)
class UpiPayee:
    vpa: str  # the UPI ID members pay
    name: str  # the name their UPI app shows


class PaymentsUnavailableError(RuntimeError):
    """Payments aren't set up, or the provider can't be reached (retry later)."""


class PaymentProvider(Protocol):
    name: str
    # "subscription": renews through the provider; "pass": a fixed number of days, bought again by hand (D127).
    kind: str
    public_key: str | None

    async def create_subscription(self) -> CreatedSubscription: ...
    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None: ...
    def verify(self, raw_body: bytes, signature: str) -> bool: ...
    async def plan_price(self) -> PlanPrice | None: ...


def razorpay_signature(secret: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def _matches(secret: str, raw_body: bytes, signature: str) -> bool:
    return bool(signature) and hmac.compare_digest(razorpay_signature(secret, raw_body), signature)


class NoPayments:
    name: str = "none"
    kind: str = "subscription"
    public_key: str | None = None

    async def create_subscription(self) -> CreatedSubscription:
        raise PaymentsUnavailableError("payments are not set up")

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        raise PaymentsUnavailableError("payments are not set up")

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return False

    async def plan_price(self) -> PlanPrice | None:
        return None


@dataclass
class FakePayments:
    secret: str = "fake-webhook-secret"  # noqa: S105 - a test value, not a credential
    name: str = "razorpay"
    kind: str = "subscription"
    public_key: str | None = "rzp_test_fake"
    created: list[str] = field(default_factory=list)
    cancelled: list[tuple[str, bool]] = field(default_factory=list)

    price: PlanPrice | None = field(default_factory=lambda: PlanPrice(29900, "INR", "monthly", 1))

    async def create_subscription(self) -> CreatedSubscription:
        sub_id = f"sub_fake{len(self.created) + 1:06d}"
        self.created.append(sub_id)
        return CreatedSubscription(id=sub_id, short_url=f"https://rzp.example/i/{sub_id}")

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        self.cancelled.append((subscription_id, at_cycle_end))

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return _matches(self.secret, raw_body, signature)

    async def plan_price(self) -> PlanPrice | None:
        return self.price


class RazorpayPayments:
    name: str = "razorpay"
    kind: str = "subscription"
    public_key: str | None

    def __init__(
        self, key_id: str, key_secret: str, webhook_secret: str, plan_id: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:  # fmt: skip
        self.public_key = key_id  # the Checkout key is public by design
        self._webhook_secret = webhook_secret
        self._plan_id = plan_id
        self._price: tuple[float, PlanPrice] | None = None
        self._client = httpx.AsyncClient(
            base_url=API, auth=(key_id, key_secret), timeout=15.0, transport=transport,
            headers={"accept": "application/json"},
        )  # fmt: skip

    async def _post(self, path: str, body: dict[str, object]) -> dict[str, object]:
        try:
            res = await self._client.post(path, json=body)
        except httpx.HTTPError as exc:
            raise PaymentsUnavailableError("payment provider unreachable") from exc
        if res.status_code == 429 or res.status_code >= 500:
            raise PaymentsUnavailableError(f"payment provider answered {res.status_code}")
        res.raise_for_status()
        payload: dict[str, object] = res.json()
        return payload

    async def plan_price(self) -> PlanPrice | None:
        if self._price is not None and time.monotonic() - self._price[0] < PRICE_TTL_S:
            return self._price[1]
        try:
            res = await self._client.get(f"/plans/{self._plan_id}")
        except httpx.HTTPError as exc:
            raise PaymentsUnavailableError("payment provider unreachable") from exc
        if res.status_code != 200:
            raise PaymentsUnavailableError(f"payment provider answered {res.status_code}")
        try:
            data = res.json()
            item = data["item"]
            price = PlanPrice(
                amount=int(item["amount"]), currency=str(item["currency"]),
                period=str(data["period"]), interval=int(data["interval"]),
            )  # fmt: skip
        except (ValueError, KeyError, TypeError) as exc:
            raise PaymentsUnavailableError("payment provider answered something unexpected") from exc
        self._price = (time.monotonic(), price)
        return price

    async def create_subscription(self) -> CreatedSubscription:
        data = await self._post("/subscriptions", {"plan_id": self._plan_id, "total_count": TOTAL_COUNT})
        short_url = data.get("short_url")
        return CreatedSubscription(id=str(data["id"]), short_url=str(short_url) if short_url else None)

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        await self._post(f"/subscriptions/{subscription_id}/cancel", {"cancel_at_cycle_end": at_cycle_end})

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return _matches(self._webhook_secret, raw_body, signature)

    async def aclose(self) -> None:
        await self._client.aclose()


@dataclass
class UpiPayments:
    """The Plus pass, paid by UPI to the operator (D127). Subscriptions don't exist here."""

    payee: UpiPayee
    price: PassPrice
    name: str = "upi"
    kind: str = "pass"
    public_key: str | None = None

    async def create_subscription(self) -> CreatedSubscription:
        raise PaymentsUnavailableError("the UPI pass has no subscriptions")

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        raise PaymentsUnavailableError("the UPI pass has no subscriptions")

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return False  # no webhooks: an admin confirms each payment

    async def plan_price(self) -> PlanPrice | None:
        return None  # a pass has no billing period; see `price`


def create_payments(settings: Settings) -> NoPayments | FakePayments | RazorpayPayments | UpiPayments:
    if settings.payments_backend == "fake":
        return FakePayments()
    if settings.payments_backend == "upi":
        if not (settings.upi_payee_vpa and settings.upi_payee_name):
            raise RuntimeError("upi settings missing")  # the settings validator stops this earlier
        return UpiPayments(
            payee=UpiPayee(settings.upi_payee_vpa, settings.upi_payee_name),
            price=PassPrice(settings.plus_price_inr * 100, "INR", settings.plus_pass_days),
        )
    if settings.payments_backend == "razorpay":
        if not (settings.razorpay_key_id and settings.razorpay_key_secret and settings.razorpay_webhook_secret):
            raise RuntimeError("razorpay settings missing")  # the settings validator stops this earlier
        return RazorpayPayments(
            settings.razorpay_key_id,
            settings.razorpay_key_secret.get_secret_value(),
            settings.razorpay_webhook_secret.get_secret_value(),
            settings.razorpay_plan_id or "",
        )
    return NoPayments()
