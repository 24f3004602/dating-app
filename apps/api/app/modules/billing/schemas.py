"""Request and response models for the plan."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from app.schemas import ApiModel

PlusStatus = Literal["open", "submitted", "approved", "rejected", "expired"]
RejectReason = Literal["not_found", "wrong_amount", "other"]


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
    is false while payments aren't set up: the apps then sell nothing. A
    `subscription` renews every `interval` `period`s; a `pass` (D127) brings
    `days` of the plan for one UPI payment and never renews."""

    available: bool
    kind: Literal["subscription", "pass"] = "subscription"
    amount: int | None = None  # in the currency's smallest unit (paise)
    currency: str | None = None
    period: Literal["daily", "weekly", "monthly", "quarterly", "yearly"] | None = None
    interval: int | None = None
    days: int | None = None


class PlusPaymentOut(ApiModel):
    """Paying for the pass (D127): pay exactly `amount` by UPI to `payee_vpa` (the
    `upi_url` opens a UPI app with everything filled in; `qr` is the same link as
    a PNG data URL, to scan from another phone), then send the 12-digit UPI
    reference before `open_until`. An admin then finds the payment in the bank."""

    id: uuid.UUID
    code: str
    status: PlusStatus
    amount: int  # paise
    currency: str
    days: int
    payee_vpa: str
    payee_name: str
    upi_url: str
    qr: str | None  # while open
    utr: str | None
    created_at: datetime
    open_until: datetime
    submitted_at: datetime | None
    decided_at: datetime | None
    reject_reason: RejectReason | None
    plus_until: datetime | None


class ReferenceIn(ApiModel):
    """The UPI reference (UTR): 12 digits, shown in the UPI app after paying."""

    utr: str = Field(pattern=r"^[0-9]{12}$")


class StaffPlusPayment(ApiModel):
    """A payment as an admin checks it against the bank: the code, the amount and
    the UPI reference. Nothing about the member: the bank match needs none."""

    id: uuid.UUID
    code: str
    status: PlusStatus
    amount: int
    currency: str
    days: int
    utr: str | None
    created_at: datetime
    submitted_at: datetime | None
    decided_at: datetime | None
    reject_reason: RejectReason | None
    plus_until: datetime | None


class PlusDecisionIn(ApiModel):
    """Approve (the payment is in the bank, for the right amount) or reject (with why)."""

    decision: Literal["approve", "reject"]
    reason: RejectReason | None = None

    @model_validator(mode="after")
    def _reason_with_reject(self) -> Self:
        if (self.decision == "reject") != (self.reason is not None):
            raise ValueError("a rejection needs a reason, and an approval takes none")
        return self
