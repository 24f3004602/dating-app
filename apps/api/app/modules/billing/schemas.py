"""Request and response models for the plan."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas import ApiModel


class SubscriptionOut(ApiModel):
    """`entitled` is decided here, from the provider's webhooks. The plan brings
    Live calls after the free ones, and longer calls (the owner's choice,
    2026-11-18, D123)."""

    status: Literal[
        "none", "created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"
    ]
    entitled: bool
    paid_until: datetime | None
    renews: bool


class CheckoutOut(ApiModel):
    """The subscription to authorise: on Razorpay's own page (`checkout_url`), or in Checkout with the key."""

    subscription_id: str
    key_id: str
    checkout_url: str | None


class PlanOut(ApiModel):
    """What the plan costs, as the payment provider will charge it. `available`
    is false while payments aren't set up: the apps then sell nothing."""

    available: bool
    amount: int | None = None  # in the currency's smallest unit (paise)
    currency: str | None = None
    period: Literal["daily", "weekly", "monthly", "quarterly", "yearly"] | None = None
    interval: int | None = None
