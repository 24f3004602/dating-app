"""Subscriptions and processed payment events (stage 16b, D094).

- `subscriptions`: our link between a member and a provider's subscription ID,
  with the status and paid-until time the provider's webhooks report. The
  entitlement is computed from these, on our server, never from the client.
- `payment_events`: provider event IDs already applied, so a webhook delivered
  twice changes nothing (Razorpay: `x-razorpay-event-id`). Kept 90 days.

No amounts, cards, UPI IDs or invoices are stored here: the provider keeps those.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, text
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


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    __table_args__ = (Index("ix_payment_events_received_at", "received_at"),)

    provider: Mapped[str] = mapped_column(String(16), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event: Mapped[str] = mapped_column(String(48))
    received_at: Mapped[datetime]
