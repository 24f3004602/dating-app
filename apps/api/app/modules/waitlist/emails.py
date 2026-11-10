"""Waitlist email texts. Plain text, discreet subject, written fresh."""

from __future__ import annotations

from app.providers.email import EmailMessage


def confirm(to: str, brand: str, *, confirm_url: str, leave_url: str, days: int) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Confirm your place on the {brand} waitlist",
        text=(
            f"To join the {brand} waitlist, confirm your email address here:\n{confirm_url}\n\n"
            f"The link works once and expires in {days} days. When {brand} opens, we'll email you once, "
            "and nothing else.\n\n"
            f"If you didn't ask to join, ignore this email: the address is deleted after {days} days. "
            f"To delete it now: {leave_url}"
        ),
    )
