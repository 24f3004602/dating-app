"""Payments behind an interface (CLAUDE.md: a payment-provider abstraction; D094).

- `NoPayments` (default): checkouts are refused; webhooks are refused.
- `FakePayments` (tests): records calls, signs like Razorpay with a test secret.
- `RazorpayPayments`: Razorpay's Subscriptions API (docs read 2026-11-05):
  POST https://api.razorpay.com/v1/subscriptions {plan_id, total_count} and
  POST .../subscriptions/{id}/cancel {cancel_at_cycle_end}, with HTTP Basic
  auth (key ID and secret). Webhooks carry `X-Razorpay-Signature`, an
  HMAC-SHA256 of the raw body under the webhook secret. Tested against a fake
  server and our own secret, not against Razorpay.

Nothing about the member is sent to Razorpay: we keep the link between our
user and their subscription ID ourselves.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.config import Settings

API = "https://api.razorpay.com/v1"
# Razorpay requires a count of billing cycles; ten years of monthly cycles,
# cancellable at any time.
TOTAL_COUNT = 120


@dataclass(frozen=True)
class CreatedSubscription:
    id: str
    short_url: str | None


class PaymentsUnavailableError(RuntimeError):
    """Payments aren't set up, or the provider can't be reached (retry later)."""


class PaymentProvider(Protocol):
    name: str
    public_key: str | None

    async def create_subscription(self) -> CreatedSubscription: ...
    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None: ...
    def verify(self, raw_body: bytes, signature: str) -> bool: ...


def razorpay_signature(secret: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def _matches(secret: str, raw_body: bytes, signature: str) -> bool:
    return bool(signature) and hmac.compare_digest(razorpay_signature(secret, raw_body), signature)


class NoPayments:
    name: str = "none"
    public_key: str | None = None

    async def create_subscription(self) -> CreatedSubscription:
        raise PaymentsUnavailableError("payments are not set up")

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        raise PaymentsUnavailableError("payments are not set up")

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return False


@dataclass
class FakePayments:
    secret: str = "fake-webhook-secret"  # noqa: S105 - a test value, not a credential
    name: str = "razorpay"
    public_key: str | None = "rzp_test_fake"
    created: list[str] = field(default_factory=list)
    cancelled: list[tuple[str, bool]] = field(default_factory=list)

    async def create_subscription(self) -> CreatedSubscription:
        sub_id = f"sub_fake{len(self.created) + 1:06d}"
        self.created.append(sub_id)
        return CreatedSubscription(id=sub_id, short_url=None)

    async def cancel(self, subscription_id: str, *, at_cycle_end: bool) -> None:
        self.cancelled.append((subscription_id, at_cycle_end))

    def verify(self, raw_body: bytes, signature: str) -> bool:
        return _matches(self.secret, raw_body, signature)


class RazorpayPayments:
    name: str = "razorpay"
    public_key: str | None

    def __init__(
        self, key_id: str, key_secret: str, webhook_secret: str, plan_id: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:  # fmt: skip
        self.public_key = key_id  # the Checkout key is public by design
        self._webhook_secret = webhook_secret
        self._plan_id = plan_id
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


def create_payments(settings: Settings) -> NoPayments | FakePayments | RazorpayPayments:
    if settings.payments_backend == "fake":
        return FakePayments()
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
