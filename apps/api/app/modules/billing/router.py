"""/v1/plan, /v1/me/subscription and /v1/webhooks/razorpay (stage 16b, D094); the
Plus pass paid by UPI, /v1/me/plus-payment, and its admin review,
/v1/admin/plus-payments (D127)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.billing import passes, service
from app.modules.billing.models import PlusPaymentStatus, PlusRejectReason
from app.modules.billing.schemas import (
    CheckoutOut,
    PlanOut,
    PlusDecisionIn,
    PlusPaymentOut,
    ReferenceIn,
    StaffPlusPayment,
    SubscriptionOut,
)
from app.modules.moderation.deps import AdminSession
from app.openapi import problems
from app.providers.payments import PaymentProvider, UpiPayments
from app.schemas import ApiModel

router = APIRouter(tags=["billing"])
admin_router = APIRouter(prefix="/v1/admin/plus-payments", tags=["admin"], responses=problems(401, 403, 422))


class WebhookOut(ApiModel):
    outcome: str


def _provider(request: Request) -> PaymentProvider:
    found: PaymentProvider = request.app.state.payments
    return found


def _upi(request: Request) -> UpiPayments | None:
    found = request.app.state.payments
    return found if isinstance(found, UpiPayments) else None


@router.get("/v1/plan", responses=problems(401), summary="What the plan costs, as the payment provider charges it")
async def plan(request: Request, auth: CurrentSession) -> PlanOut:
    return await service.plan(_provider(request))


@router.get("/v1/me/subscription", responses=problems(401), summary="My plan: status, whether it's active, until when")
async def mine(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> SubscriptionOut:
    return await service.my_subscription(db, auth.user.id, ctx.clock())


@router.post(
    "/v1/me/subscription",
    status_code=status.HTTP_201_CREATED,
    responses=problems(401, 409, 429, 503),
    summary="Start a subscription to authorise on Razorpay's page (web and sideloaded apps; never in store builds)",
)
async def checkout(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> CheckoutOut:
    await ctx.limiter.hit(service.CHECKOUT_LIMIT, str(auth.user.id))
    return await service.start_checkout(db, _provider(request), auth.user.id, ctx.clock())


@router.post(
    "/v1/me/subscription/cancel",
    responses=problems(401, 409, 503),
    summary="Stop renewing: the plan lasts until the end of what was paid",
)
async def cancel(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> SubscriptionOut:
    return await service.cancel(db, _provider(request), auth.user.id, ctx.clock())


@router.get(
    "/v1/me/plus-payment",
    responses=problems(401),
    summary="My Plus pass payment in progress, or the last one decided this week (null if none)",
)
async def my_plus_payment(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> PlusPaymentOut | None:
    upi = _upi(request)
    if upi is None:
        return None
    return await passes.current(db, upi, auth.user.id, brand=ctx.settings.brand_name, now=ctx.clock())


@router.post(
    "/v1/me/plus-payment",
    status_code=status.HTTP_201_CREATED,
    responses=problems(401, 409, 429, 503),
    summary="Start paying for the Plus pass by UPI, or get the payment already open (web and sideloaded apps only)",
)
async def start_plus_payment(request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> PlusPaymentOut:
    upi = _upi(request)
    if upi is None:
        raise service.unavailable()
    await ctx.limiter.hit(passes.START_LIMIT, str(auth.user.id))
    return await passes.start(db, upi, auth.user.id, brand=ctx.settings.brand_name, now=ctx.clock())


@router.put(
    "/v1/me/plus-payment/{payment_id}/reference",
    responses=problems(401, 404, 409, 429, 503),
    summary="Send the 12-digit UPI reference (UTR) of the payment, for an admin to find in the bank",
)
async def send_reference(
    payment_id: uuid.UUID, body: ReferenceIn, *, request: Request, auth: CurrentSession, ctx: AuthCtx, db: DbSession
) -> PlusPaymentOut:
    upi = _upi(request)
    if upi is None:
        raise service.unavailable()
    await ctx.limiter.hit(passes.REFERENCE_LIMIT, str(auth.user.id))
    return await passes.send_reference(
        db, upi, auth.user.id, payment_id, body.utr, brand=ctx.settings.brand_name, now=ctx.clock()
    )


Limit = Annotated[int, Query(ge=1, le=100)]


@admin_router.get("", summary="Plus pass payments: waiting to be checked (oldest first) or decided (audited; admins)")
async def staff_payments(
    staff: AdminSession, db: DbSession, status: PlusPaymentStatus = PlusPaymentStatus.submitted, limit: Limit = 50
) -> list[StaffPlusPayment]:
    return await passes.for_staff(db, staff.user, status, limit)


@admin_router.post(
    "/{payment_id}/decision",
    responses=problems(404, 409),
    summary="Approve a payment found in the bank (the pass starts), or reject it with why (admins)",
)
async def decide_payment(
    payment_id: uuid.UUID, body: PlusDecisionIn, staff: AdminSession, ctx: AuthCtx, db: DbSession
) -> StaffPlusPayment:
    return await passes.decide(
        db, staff.user, payment_id, approve=body.decision == "approve",
        reason=PlusRejectReason(body.reason) if body.reason else None, now=ctx.clock(),
    )  # fmt: skip


@router.post(
    "/v1/webhooks/razorpay",
    responses=problems(400),
    summary="Razorpay webhooks: signature checked over the raw body; each event applied once",
)
async def razorpay_webhook(request: Request, ctx: AuthCtx, db: DbSession) -> WebhookOut:
    outcome = await service.apply_webhook(
        db,
        _provider(request),
        raw_body=await request.body(),
        signature=request.headers.get("x-razorpay-signature", ""),
        event_id=request.headers.get("x-razorpay-event-id", ""),
        now=ctx.clock(),
    )
    return WebhookOut(outcome=outcome)
