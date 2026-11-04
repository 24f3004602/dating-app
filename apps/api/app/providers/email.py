"""Email delivery behind an interface (architecture: integration strategy).

Development and tests use the console and in-memory senders. A real adapter
(SES, Postmark, Resend or SMTP) is added once the owner has an account and
the sending domain has SPF, DKIM and DMARC; production refuses to start
without one (Settings).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class ConsoleEmailSender:
    """Development only: prints the message to stdout (never to the logs)."""

    async def send(self, message: EmailMessage) -> None:
        print(  # noqa: T201 - deliberate: dev mail goes to stdout, not the log pipeline
            f"\n----- DEV EMAIL (not sent) -----\nTo: {message.to}\nSubject: {message.subject}\n\n"
            f"{message.text}\n--------------------------------",
            file=sys.stdout,
            flush=True,
        )


class MemoryEmailSender:
    """Tests: keeps every message in `outbox`."""

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.outbox.append(message)


def create_email_sender(settings: Settings) -> EmailSender:
    if settings.email_backend == "memory":
        return MemoryEmailSender()
    if settings.email_backend == "console":
        if settings.is_production:
            raise RuntimeError("the console email backend is not allowed in production")
        return ConsoleEmailSender()
    raise RuntimeError(f"unknown email backend {settings.email_backend!r}")
