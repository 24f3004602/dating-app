"""The Plus pass, paid by UPI straight to the operator (D127, the owner's choice).

- **Paying:** a member starts a payment and gets a short code, the exact amount
  and the operator's UPI ID, as a `upi://pay` link (NPCI's linking format: the
  app opens with everything filled in) and its QR code. After paying in any UPI
  app, they send the 12-digit UPI reference (UTR) within `OPEN_FOR`.
- **Confirming:** an admin finds the reference in the bank account and approves
  (the pass starts, or extends the one running) or rejects with a reason. No
  bank SMS, inbox or statement is read by the server.
- **Replay:** one reference backs at most one pending or approved payment (a
  partial unique index), so one bank payment never buys two passes. The amount
  and days are fixed on the server when the payment starts.
- **Never renews:** a pass ends on its own; buying another adds its days after
  the end of the current one.

The payer's UPI ID and name are never asked for or stored. Records outlive the
account (accounting), without the link to it.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import quote

import segno
from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.audit.service import record
from app.modules.billing.models import PlusPayment, PlusPaymentStatus, PlusRejectReason
from app.modules.billing.schemas import PlusPaymentOut, StaffPlusPayment
from app.modules.privacy import retention
from app.providers.payments import UpiPayments
from app.ratelimit import Limit

OPEN_FOR = timedelta(hours=48)  # to pay and send the reference
SHOWN_AFTER_DECISION = timedelta(days=7)  # the app keeps showing a decision this long
START_LIMIT = Limit("plus_payment", 10, 3600)
REFERENCE_LIMIT = Limit("plus_reference", 10, 3600)
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to misread
CODE_LENGTH = 8
PENDING = (PlusPaymentStatus.open, PlusPaymentStatus.submitted)
HELD = (PlusPaymentStatus.submitted, PlusPaymentStatus.approved)  # a reference these hold can't be sent again


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def upi_url(provider: UpiPayments, amount: int, code: str, brand: str) -> str:
    """`upi://pay?pa=...&pn=...&am=299.00&cu=INR&tn=...`, values percent-encoded (the @ kept)."""
    params = (
        ("pa", provider.payee.vpa),
        ("pn", provider.payee.name),
        ("am", f"{amount // 100}.{amount % 100:02d}"),
        ("cu", "INR"),
        ("tn", f"{brand} Plus {code}"),
    )
    return "upi://pay?" + "&".join(f"{key}={quote(value, safe='@.-_')}" for key, value in params)


def qr_data_uri(url: str) -> str:
    """The link as a QR code (black on white, for every scanner), a PNG data URL."""
    uri: str = segno.make(url, error="m").png_data_uri(scale=6, border=4)
    return uri


def _out(p: PlusPayment, provider: UpiPayments, brand: str) -> PlusPaymentOut:
    url = upi_url(provider, p.amount, p.code, brand)
    return PlusPaymentOut(
        id=p.id, code=p.code, status=p.status.value, amount=p.amount, currency=p.currency, days=p.days,
        payee_vpa=provider.payee.vpa, payee_name=provider.payee.name, upi_url=url,
        qr=qr_data_uri(url) if p.status is PlusPaymentStatus.open else None,
        utr=p.utr, created_at=p.created_at, open_until=p.created_at + OPEN_FOR, submitted_at=p.submitted_at,
        decided_at=p.decided_at, reject_reason=p.reject_reason.value if p.reject_reason else None,
        plus_until=p.plus_until,
    )  # fmt: skip


def _staff_out(p: PlusPayment) -> StaffPlusPayment:
    return StaffPlusPayment(
        id=p.id, code=p.code, status=p.status.value, amount=p.amount, currency=p.currency, days=p.days, utr=p.utr,
        created_at=p.created_at, submitted_at=p.submitted_at, decided_at=p.decided_at,
        reject_reason=p.reject_reason.value if p.reject_reason else None, plus_until=p.plus_until,
    )  # fmt: skip


async def _expire(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """Open payments past their time can no longer take a reference."""
    await session.execute(
        update(PlusPayment)
        .where(
            PlusPayment.user_id == user_id,
            PlusPayment.status == PlusPaymentStatus.open,
            PlusPayment.created_at <= now - OPEN_FOR,
        )
        .values(status=PlusPaymentStatus.expired)
    )


async def pass_until(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> datetime | None:
    """The end of the member's pass, if one is running."""
    until: datetime | None = (
        await session.execute(
            select(func.max(PlusPayment.plus_until)).where(
                PlusPayment.user_id == user_id,
                PlusPayment.status == PlusPaymentStatus.approved,
                PlusPayment.plus_until > now,
            )
        )
    ).scalar_one()
    return until


async def current(
    session: AsyncSession, provider: UpiPayments, user_id: uuid.UUID, *, brand: str, now: datetime
) -> PlusPaymentOut | None:
    """The payment in progress, or the last one decided in the past week."""
    await _expire(session, user_id, now)
    latest = (
        await session.execute(
            select(PlusPayment)
            .where(PlusPayment.user_id == user_id)
            .order_by(PlusPayment.created_at.desc(), PlusPayment.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    await session.commit()
    if latest is None or latest.status is PlusPaymentStatus.expired:
        return None
    if latest.decided_at is not None and latest.decided_at < now - SHOWN_AFTER_DECISION:
        return None
    return _out(latest, provider, brand)


async def start(
    session: AsyncSession, provider: UpiPayments, user_id: uuid.UUID, *, brand: str, now: datetime
) -> PlusPaymentOut:
    """A payment to make, or the one already open. One pending payment at a time."""
    # One member's starts run one at a time (a double tap makes one payment).
    await session.execute(select(User.id).where(User.id == user_id).with_for_update(key_share=True))
    await _expire(session, user_id, now)
    pending = (
        await session.execute(
            select(PlusPayment)
            .where(PlusPayment.user_id == user_id, PlusPayment.status.in_(PENDING))
            .order_by(PlusPayment.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if pending is not None and pending.status is PlusPaymentStatus.submitted:
        await session.commit()
        raise ApiError(409, "payment_pending", "We're still checking your last payment.")
    if pending is None:
        price = provider.price
        for _ in range(3):  # a repeated code is all but impossible; never fail on one
            try:
                async with session.begin_nested():
                    pending = PlusPayment(
                        user_id=user_id, code=new_code(), amount=price.amount, currency=price.currency,
                        days=price.days, status=PlusPaymentStatus.open, created_at=now,
                    )  # fmt: skip
                    session.add(pending)
                break
            except IntegrityError:
                pending = None
        if pending is None:
            raise ApiError(503, "payments_unavailable", "Payments aren't available right now.")
        record(session, "billing.plus_payment_started", actor=user_id, target_type="user", target_id=user_id)
    await session.commit()
    return _out(pending, provider, brand)


async def send_reference(
    session: AsyncSession,
    provider: UpiPayments,
    user_id: uuid.UUID,
    payment_id: uuid.UUID,
    utr: str,
    *,
    brand: str,
    now: datetime,
) -> PlusPaymentOut:
    p = (
        await session.execute(
            select(PlusPayment).where(PlusPayment.id == payment_id, PlusPayment.user_id == user_id).with_for_update()
        )
    ).scalar_one_or_none()
    if p is None:
        raise ApiError(404, "not_found")
    if p.status is PlusPaymentStatus.open and p.created_at <= now - OPEN_FOR:
        p.status = PlusPaymentStatus.expired
        await session.commit()
        raise ApiError(409, "payment_expired", "This payment's time ran out. Start a new one.")
    if p.status is not PlusPaymentStatus.open:
        await session.commit()
        raise ApiError(409, "payment_closed", "This payment can't take a reference any more.")
    held = await session.scalar(select(exists().where(PlusPayment.utr == utr, PlusPayment.status.in_(HELD))))
    if held:
        await session.commit()
        raise ApiError(409, "reference_used", "That UPI reference has already been sent.")
    p.status = PlusPaymentStatus.submitted
    p.utr = utr
    p.submitted_at = now
    try:
        await session.flush()
    except IntegrityError as exc:  # the same reference sent twice at once
        await session.rollback()
        raise ApiError(409, "reference_used", "That UPI reference has already been sent.") from exc
    record(session, "billing.plus_reference_sent", actor=user_id, target_type="user", target_id=user_id)
    await session.commit()
    return _out(p, provider, brand)


# --- admins --------------------------------------------------------------------------


async def for_staff(
    session: AsyncSession, staff: User, status: PlusPaymentStatus, limit: int
) -> list[StaffPlusPayment]:
    """Payments to check (oldest first), or the latest decisions (newest first). Audited."""
    order = (
        (PlusPayment.submitted_at, PlusPayment.id)
        if status is PlusPaymentStatus.submitted
        else (PlusPayment.decided_at.desc(), PlusPayment.id)
    )
    rows = list(
        (await session.execute(select(PlusPayment).where(PlusPayment.status == status).order_by(*order).limit(limit)))
        .scalars()
        .all()
    )
    record(session, "admin.plus_payments_viewed", actor=staff.id, count=len(rows), status=status.value)
    await session.commit()
    return [_staff_out(p) for p in rows]


async def decide(
    session: AsyncSession,
    staff: User,
    payment_id: uuid.UUID,
    *,
    approve: bool,
    reason: PlusRejectReason | None,
    now: datetime,
) -> StaffPlusPayment:
    """Approve: the pass starts now, or when the running one ends. Reject: with why."""
    p = (
        await session.execute(select(PlusPayment).where(PlusPayment.id == payment_id).with_for_update())
    ).scalar_one_or_none()
    if p is None:
        raise ApiError(404, "not_found")
    if p.status is not PlusPaymentStatus.submitted:
        raise ApiError(409, "already_decided", "This payment has been decided already.")
    if p.user_id == staff.id:
        raise ApiError(409, "own_account", "Staff can't decide their own payments.")
    if approve:
        if p.user_id is None:
            raise ApiError(409, "member_gone", "This member has deleted their account. Refund the payment instead.")
        # Two approvals for one member run one at a time, so their passes never overlap.
        await session.execute(select(User.id).where(User.id == p.user_id).with_for_update(key_share=True))
        running = await pass_until(session, p.user_id, now)
        p.plus_from = max(now, running) if running else now
        p.plus_until = p.plus_from + timedelta(days=p.days)
        p.status = PlusPaymentStatus.approved
    else:
        p.status = PlusPaymentStatus.rejected
        p.reject_reason = reason or PlusRejectReason.other
    p.decided_at = now
    p.decided_by = staff.id
    record(
        session, "admin.plus_payment_decided", actor=staff.id, target_type="user", target_id=p.user_id,
        action="approve" if approve else "reject",
    )  # fmt: skip
    await session.commit()
    return _staff_out(p)


# --- retention -----------------------------------------------------------------------


async def purge(session: AsyncSession, now: datetime) -> int:
    """Unpaid attempts after a month; every record after the accounting period (R)."""
    gone = await session.execute(
        delete(PlusPayment)
        .where(
            or_(
                (
                    PlusPayment.status.in_((PlusPaymentStatus.open, PlusPaymentStatus.expired))
                    & (PlusPayment.created_at < now - retention.UNPAID_PLUS_PAYMENT)
                ),
                PlusPayment.created_at < now - retention.PLUS_PAYMENT_RECORD,
            )
        )
        .returning(PlusPayment.id)
    )
    return len(gone.all())
