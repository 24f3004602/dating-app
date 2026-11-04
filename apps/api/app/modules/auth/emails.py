"""Transactional email texts. Plain text, discreet subjects, written fresh."""

from __future__ import annotations

from app.providers.email import EmailMessage


def verification_code(to: str, brand: str, code: str, minutes: int) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Your {brand} code",
        text=(
            f"Your code is {code}\n\n"
            f"Enter it in the app to confirm your email address. It works once and expires in {minutes} minutes.\n\n"
            "If you didn't sign up, you can ignore this email. Nobody can use your address without this code."
        ),
    )


def reset_code(to: str, brand: str, code: str, minutes: int) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Your {brand} password reset code",
        text=(
            f"Your password reset code is {code}\n\n"
            f"It works once and expires in {minutes} minutes. Resetting your password signs you out everywhere.\n\n"
            "If you didn't ask for this, ignore this email; your password stays the same."
        ),
    )


def signup_attempt(to: str, brand: str) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Someone tried to sign up to {brand} with your address",
        text=(
            "Someone tried to create an account with this email address, which already has one.\n\n"
            "If it was you, just sign in, or reset your password if you have forgotten it. "
            "If it wasn't you, no action is needed: nothing was changed."
        ),
    )


def password_changed(to: str, brand: str) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Your {brand} password was changed",
        text=(
            "Your password was just reset, and every device was signed out.\n\n"
            "If this wasn't you, reset your password again straight away and contact support."
        ),
    )


def password_locked(to: str, brand: str) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=f"Password sign-in paused on your {brand} account",
        text=(
            "There were too many wrong password attempts on your account, so password sign-in is paused.\n\n"
            "To sign in again, reset your password from the sign-in screen."
        ),
    )
