"""/v1/me/subscription and /v1/webhooks/razorpay (stage 16b, D094). Sandbox only."""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.modules.auth.deps import AuthCtx, CurrentSession, DbSession
from app.modules.billing import service
from app.modules.billing.schemas import CheckoutOut, SubscriptionOut
from app.openapi import problems
from app.providers.payments import PaymentProvider
from app.schemas import ApiModel

router = APIRouter(tags=["billing"])


class WebhookOut(ApiModel):
    outcome: str


def _provider(request: Request) -> PaymentProvider:
    found: PaymentProvider = request.app.state.payments
    return found


@router.get("/v1/me/subscription", responses=problems(401), summary="My plan: status, whether it's active, until when")
async def mine(auth: CurrentSession, ctx: AuthCtx, db: DbSession) -> SubscriptionOut:
    return await service.my_subscription(db, auth.user.id, ctx.clock())


@router.post(
    "/v1/me/subscription",
    status_code=status.HTTP_201_CREATED,
    responses=problems(401, 409, 429, 503),
    summary="Start a subscription to authorise in Razorpay Checkout (website only; sandbox)",
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
