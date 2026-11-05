"""Email delivery behind an interface (architecture: integration strategy).

Development and tests use the console and in-memory senders. `SmtpEmailSender`
sends through any SMTP submission server (stage 18, D096): a Gmail app password
for the beta, a provider's SMTP credentials (SES, Postmark, Resend...) once the
sending domain has SPF, DKIM and DMARC. A deployed server refuses to start
without a real sender (Settings).
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
import sys
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid
from typing import Literal, Protocol

from app.config import Settings


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str


class EmailDeliveryError(RuntimeError):
    """Delivery failed. Carries the error type and SMTP status code only: server
    replies can echo the recipient's address, which must not reach the logs."""


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


class SmtpEmailSender:
    """SMTP submission, always encrypted: STARTTLS (required, never skipped) or
    implicit TLS, with certificate and host-name checks. Plain text only. The
    message and the password never reach the logs; a failure raises, and the
    job queue retries (app.jobs)."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        security: Literal["starttls", "tls"],
        username: str | None,
        password: str | None,
        sender: str,
        timeout_s: float,
        tls_context: ssl.SSLContext | None = None,
    ) -> None:
        self._host = host
        self._port = port
        self._security = security
        self._username = username
        self._password = password
        self._sender = sender
        self._timeout = timeout_s
        self._context = tls_context or ssl.create_default_context()
        self._msgid_domain = sender.rpartition("@")[2] or None

    async def send(self, message: EmailMessage) -> None:
        mime = self._mime(message)
        try:
            await asyncio.to_thread(self._send, mime)
        except (smtplib.SMTPException, OSError) as exc:
            code = getattr(exc, "smtp_code", None)
            detail = f" ({code})" if isinstance(code, int) else ""
            raise EmailDeliveryError(f"SMTP delivery failed: {type(exc).__name__}{detail}") from None

    def _mime(self, message: EmailMessage) -> MimeMessage:
        # The default policy refuses CR or LF in header values (no header injection).
        mime = MimeMessage()
        mime["From"] = self._sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime["Date"] = formatdate(usegmt=True)
        mime["Message-ID"] = make_msgid(domain=self._msgid_domain)
        mime.set_content(message.text)
        return mime

    def _send(self, mime: MimeMessage) -> None:
        smtp: smtplib.SMTP
        if self._security == "tls":
            smtp = smtplib.SMTP_SSL(self._host, self._port, timeout=self._timeout, context=self._context)
        else:
            smtp = smtplib.SMTP(self._host, self._port, timeout=self._timeout)
        with smtp:
            if self._security == "starttls":
                smtp.ehlo()
                smtp.starttls(context=self._context)  # raises if the server doesn't offer it
                smtp.ehlo()
            if self._username is not None and self._password is not None:
                smtp.login(self._username, self._password)
            smtp.send_message(mime)


def create_email_sender(settings: Settings) -> EmailSender:
    if settings.email_backend == "memory":
        return MemoryEmailSender()
    if settings.email_backend == "console":
        if settings.is_deployed:
            raise RuntimeError(f"the console email backend is not allowed in {settings.app_env}")
        return ConsoleEmailSender()
    if settings.email_backend == "smtp":
        if not settings.smtp_host:
            raise RuntimeError("the smtp email backend needs SMTP_HOST")
        return SmtpEmailSender(
            host=settings.smtp_host,
            port=settings.smtp_port,
            security=settings.smtp_security,
            username=settings.smtp_username,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            sender=settings.email_from,
            timeout_s=settings.smtp_timeout_s,
        )
    raise RuntimeError(f"unknown email backend {settings.email_backend!r}")
