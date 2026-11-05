"""The plan's server side (stage 16b, D094): checkout, cancel, webhooks, entitlement.

- **Webhooks:** the signature is checked over the raw body before anything is
  parsed. Each event ID is applied once. Events about subscriptions we didn't
  create are ignored, and so are events older than the last one applied (they
  can arrive out of order).
- **Entitlement:** a member is entitled while the paid period hasn't ended,
  whatever the state, because what was paid for is honoured. A subscription
  that was only created (never paid) or expired gives nothing.
- **Easy exit (pricing principle 4):** cancel ends the plan at the end of the
  paid period. An account deletion cancels at once, so a member who leaves is
  never charged again.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.jobs import JobQueue
from app.modules.audit.service import record
from app.modules.billing.models import STATUSES, PaymentEvent, Subscription
from app.modules.billing.schemas import CheckoutOut, SubscriptionOut
from app.providers.payments import PaymentProvider, PaymentsUnavailableError
from app.ratelimit import Limit

logger = logging.getLogger(__name__)

CHECKOUT_LIMIT = Limit("checkout", 10, 3600)
CANCEL_FOR_DELETION = "billing:cancel_for_deletion"
LIVE = ("authenticated", "active", "pending", "paused")  # still able to charge
EVENT_RETENTION = timedelta(days=90)


def _unavailable() -> ApiError:
    return ApiError(503, "payments_unavailable", "Payments aren't available yet.", headers={"Retry-After": "3600"})


async def _latest(session: AsyncSession, user_id: uuid.UUID, *, lock: bool = False) -> Subscription | None:
    stmt = select(Subscription).where(Subscription.user_id == user_id).order_by(Subscription.created_at.desc()).limit(1)
    if lock:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


def entitled(sub: Subscription | None, now: datetime) -> bool:
    return bool(
        sub is not None and sub.status not in ("created", "expired") and sub.current_end and sub.current_end > now
    )


def subscription_out(sub: Subscription | None, now: datetime) -> SubscriptionOut:
    if sub is None:
        return SubscriptionOut(status="none", entitled=False, paid_until=None, renews=False)
    return SubscriptionOut(
        status=sub.status,
        entitled=entitled(sub, now),
        paid_until=sub.current_end,
        renews=sub.status in ("authenticated", "active") and not sub.cancel_at_cycle_end,
    )


async def my_subscription(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> SubscriptionOut:
    return subscription_out(await _latest(session, user_id), now)


async def start_checkout(
    session: AsyncSession, provider: PaymentProvider, user_id: uuid.UUID, now: datetime
) -> CheckoutOut:
    """A new subscription for the member to authorise in Razorpay Checkout."""
    if provider.public_key is None:
        raise _unavailable()
    current = await _latest(session, user_id, lock=True)
    if entitled(current, now) or (current is not None and current.status in LIVE):
        raise ApiError(409, "already_subscribed", "You already have the plan.")
    try:
        created = await provider.create_subscription()
    except PaymentsUnavailableError as exc:
        raise _unavailable() from exc
    session.add(
        Subscription(
            user_id=user_id, provider=provider.name, provider_subscription_id=created.id,
            status="created", created_at=now, updated_at=now,
        )
    )  # fmt: skip
    record(session, "billing.checkout_started", actor=user_id, target_type="user", target_id=user_id)
    await session.commit()
    return CheckoutOut(subscription_id=created.id, key_id=provider.public_key)


async def cancel(
    session: AsyncSession, provider: PaymentProvider, user_id: uuid.UUID, now: datetime
) -> SubscriptionOut:
    """Stop renewing: the plan lasts to the end of what was paid."""
    sub = await _latest(session, user_id, lock=True)
    if sub is None or sub.status not in LIVE:
        raise ApiError(409, "nothing_to_cancel", "You don't have a plan that renews.")
    if not sub.cancel_at_cycle_end:
        try:
            await provider.cancel(sub.provider_subscription_id, at_cycle_end=True)
        except PaymentsUnavailableError as exc:
            raise _unavailable() from exc
        sub.cancel_at_cycle_end = True
        sub.updated_at = now
        record(session, "billing.cancel_requested", actor=user_id, target_type="user", target_id=user_id)
        await session.commit()
    return subscription_out(sub, now)


# --- webhooks ------------------------------------------------------------------------


def _ts(value: object) -> datetime | None:
    return datetime.fromtimestamp(value, UTC) if isinstance(value, int) and value > 0 else None


async def apply_webhook(
    session: AsyncSession, provider: PaymentProvider, *, raw_body: bytes, signature: str, event_id: str, now: datetime
) -> str:
    """Returns what happened: applied, duplicate, stale, unknown or ignored.
    Raises 400 for a bad signature or body (the provider will retry)."""
    if not provider.verify(raw_body, signature):
        logger.warning("webhook signature rejected", extra={"event": "billing.webhook_rejected"})
        raise ApiError(400, "invalid_signature", "The webhook signature is not valid.")
    try:
        payload = json.loads(raw_body)
        event = str(payload["event"])
        event_at = _ts(payload.get("created_at"))
    except (ValueError, KeyError, TypeError) as exc:
        raise ApiError(400, "invalid_webhook", "The webhook body is not valid.") from exc
    if not event_id or len(event_id) > 64:
        raise ApiError(400, "invalid_webhook", "The webhook has no event ID.")

    first = await session.execute(
        pg_insert(PaymentEvent)
        .values(provider=provider.name, event_id=event_id, event=event[:48], received_at=now)
        .on_conflict_do_nothing()
        .returning(PaymentEvent.event_id)
    )
    if first.first() is None:
        await session.commit()
        return "duplicate"
    if not event.startswith("subscription."):
        await session.commit()
        return "ignored"
    try:
        entity = payload["payload"]["subscription"]["entity"]
        sub_id, status = str(entity["id"]), str(entity["status"])
    except (KeyError, TypeError) as exc:
        raise ApiError(400, "invalid_webhook", "The webhook body is not valid.") from exc

    sub = (
        await session.execute(
            select(Subscription).where(Subscription.provider_subscription_id == sub_id).with_for_update()
        )
    ).scalar_one_or_none()
    if sub is None or status not in STATUSES:
        await session.commit()  # remembered as seen, changes nothing
        return "unknown"
    if sub.last_event_at and event_at and event_at < sub.last_event_at:
        await session.commit()
        return "stale"
    sub.status = status
    sub.current_end = _ts(entity.get("current_end")) or sub.current_end
    sub.last_event_at = event_at or sub.last_event_at
    sub.updated_at = now
    if status == "cancelled":
        sub.cancel_at_cycle_end = False
    record(session, f"billing.{event.replace('subscription.', 'subscription_')}", actor=None,
           target_type="user", target_id=sub.user_id)  # fmt: skip
    await session.commit()
    return "applied"


# --- deletion and retention ----------------------------------------------------------


async def cancel_for_deletion(session: AsyncSession, jobs: JobQueue, user_id: uuid.UUID) -> None:
    """In the deletion request's transaction: stop charging someone who is leaving."""
    sub = await _latest(session, user_id)
    if sub is not None and sub.status in LIVE:
        await jobs.defer(session, CANCEL_FOR_DELETION, subscription_id=sub.provider_subscription_id)


async def purge_events(session: AsyncSession, now: datetime) -> int:
    gone = await session.execute(
        delete(PaymentEvent).where(PaymentEvent.received_at < now - EVENT_RETENTION).returning(PaymentEvent.event_id)
    )
    return len(gone.all())
