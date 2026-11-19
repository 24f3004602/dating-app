"""Subscriptions and processed payment events (stage 16b, D094).

- `subscriptions`: our link between a member and a provider's subscription ID,
  with the status and paid-until time the provider's webhooks report. The
  entitlement is computed from these, on our server, never from the client.
- `payment_events`: provider event IDs already applied, so a webhook delivered
  twice changes nothing (Razorpay: `x-razorpay-event-id`). Kept 90 days.

No amounts, cards, UPI IDs or invoices are stored for these: the provider keeps those.

- `plus_payments` (D127): the Plus pass, paid by UPI straight to the operator.
  One row per attempt: a short code for the payment's note, the amount and
  days, then the 12-digit UPI reference (UTR) the member sends, and an admin's
  decision after checking the bank account. An approved row is the pass itself
  (`plus_from` to `plus_until`). A reference can back one pending or approved
  payment only, so one bank payment never buys two passes. The payer's own
  UPI ID and name are never asked for or stored. These are accounting records:
  they outlive the account, without its link (`user_id` is cleared).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Index, Integer, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin

STATUSES = ("created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired")


class Subscription(CreatedAtMixin, Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(f"status IN ({', '.join(repr(s) for s in STATUSES)})", name="status_known"),
        Index("ix_subscriptions_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(16))
    provider_subscription_id: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(16), server_default=text("'created'"))
    # The end of the paid period, from the provider; the member is entitled until then.
    current_end: Mapped[datetime | None]
    cancel_at_cycle_end: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    # The provider's time of the last event applied: older events arriving late are ignored.
    last_event_at: Mapped[datetime | None]
    updated_at: Mapped[datetime]


class PlusPaymentStatus(enum.StrEnum):
    open = "open"  # waiting for the member to pay and send the UPI reference
    submitted = "submitted"  # a reference was sent: an admin checks the bank
    approved = "approved"  # found in the bank: this row is the pass
    rejected = "rejected"  # not found, or not the right amount
    expired = "expired"  # no reference came in time


class PlusRejectReason(enum.StrEnum):
    not_found = "not_found"  # no payment with this reference reached the account
    wrong_amount = "wrong_amount"  # a payment arrived, for another amount
    other = "other"


def _enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class PlusPayment(CreatedAtMixin, Base):
    __tablename__ = "plus_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("days > 0", name="days_positive"),
        CheckConstraint("utr IS NULL OR utr ~ '^[0-9]{12}$'", name="utr_digits"),
        CheckConstraint("(status IN ('open', 'expired')) = (utr IS NULL)", name="utr_once_sent"),
        CheckConstraint("(status IN ('approved', 'rejected')) = (decided_at IS NOT NULL)", name="decided_consistent"),
        CheckConstraint("(status = 'approved') = (plus_until IS NOT NULL)", name="approved_has_period"),
        CheckConstraint("(status = 'rejected') = (reject_reason IS NOT NULL)", name="rejected_has_reason"),
        CheckConstraint("plus_until IS NULL OR plus_until > plus_from", name="period_forward"),
        Index("ix_plus_payments_user_id_created_at", "user_id", "created_at"),
        Index("ix_plus_payments_status_submitted_at", "status", "submitted_at"),
        # One bank payment backs at most one pending or approved pass (payment replay, CLAUDE.md).
        Index("uq_plus_payments_utr", "utr", unique=True, postgresql_where=text("status IN ('submitted', 'approved')")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(String(8), unique=True)
    amount: Mapped[int] = mapped_column(Integer)  # paise
    currency: Mapped[str] = mapped_column(String(3))
    days: Mapped[int] = mapped_column(SmallInteger)
    status: Mapped[PlusPaymentStatus] = mapped_column(_enum(PlusPaymentStatus, "status"))
    utr: Mapped[str | None] = mapped_column(String(12))
    submitted_at: Mapped[datetime | None]
    decided_at: Mapped[datetime | None]
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reject_reason: Mapped[PlusRejectReason | None] = mapped_column(_enum(PlusRejectReason, "reject_reason"))
    plus_from: Mapped[datetime | None]
    plus_until: Mapped[datetime | None]


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    __table_args__ = (Index("ix_payment_events_received_at", "received_at"),)

    provider: Mapped[str] = mapped_column(String(16), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event: Mapped[str] = mapped_column(String(48))
    received_at: Mapped[datetime]
