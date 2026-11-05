"""Request and response models for the plan."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas import ApiModel


class SubscriptionOut(ApiModel):
    """`entitled` is decided here, from the provider's webhooks. The plan unlocks
    nothing yet: what it includes is the owner's decision (pricing P2, D094)."""

    status: Literal[
        "none", "created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"
    ]
    entitled: bool
    paid_until: datetime | None
    renews: bool


class CheckoutOut(ApiModel):
    """For Razorpay Checkout on the website: the subscription to authorise and the public key."""

    subscription_id: str
    key_id: str
