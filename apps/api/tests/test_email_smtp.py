"""MAIL-1..6 (stage 18, D096): SMTP delivery, always over TLS, with errors that
never carry an address or the password."""

from __future__ import annotations

import email
import email.policy
import ssl
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.providers.email import EmailDeliveryError, EmailMessage, SmtpEmailSender, create_email_sender
from tests.smtp_fake import HOST, FakeSmtpServer, client_context, make_certificate, server_context
from tests.test_app_config import settings_from

USER, PASSWORD = "beta-sender@example.com", "app-password-for-tests"
MESSAGE = EmailMessage(to="tester@example.com", subject="Your code", text="Your code is 123456.\nIt expires soon.")


@pytest.fixture(scope="module")
def cert(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    return make_certificate(tmp_path_factory.mktemp("smtp-cert"))


def sender(
    port: int, cert: Path, *, security: str = "starttls", password: str = PASSWORD, trust: bool = True
) -> SmtpEmailSender:
    return SmtpEmailSender(
        host=HOST,
        port=port,
        security=security,  # type: ignore[arg-type]
        username=USER,
        password=password,
        sender=USER,
        timeout_s=10,
        tls_context=client_context(cert) if trust else ssl.create_default_context(),
    )


async def test_starttls_delivery_authenticates_only_after_tls(cert: tuple[Path, Path]) -> None:
    async with FakeSmtpServer(server_context(*cert)) as server:
        await sender(server.port, cert[0]).send(MESSAGE)
    assert server.auth_attempts == [True]  # the password never crossed in clear
    [got] = server.received
    assert got.mail_from == USER
    assert got.rcpt_to == ["tester@example.com"]
    parsed = email.message_from_string(got.data, policy=email.policy.default)
    assert parsed["From"] == USER
    assert parsed["To"] == "tester@example.com"
    assert parsed["Subject"] == "Your code"
    assert parsed["Date"]
    assert parsed["Message-ID"].endswith("@example.com>")
    assert parsed.get_content().replace("\r\n", "\n").rstrip("\n") == MESSAGE.text  # CRLF on the wire


async def test_implicit_tls_delivery(cert: tuple[Path, Path]) -> None:
    async with FakeSmtpServer(server_context(*cert), implicit_tls=True) as server:
        await sender(server.port, cert[0], security="tls").send(MESSAGE)
    assert server.auth_attempts == [True]
    assert len(server.received) == 1


async def test_a_server_without_starttls_is_refused_before_the_password_is_sent(cert: tuple[Path, Path]) -> None:
    async with FakeSmtpServer(server_context(*cert), offer_starttls=False) as server:
        with pytest.raises(EmailDeliveryError, match="SMTPNotSupportedError"):
            await sender(server.port, cert[0]).send(MESSAGE)
    assert server.auth_attempts == []
    assert server.received == []


async def test_an_untrusted_certificate_is_refused(cert: tuple[Path, Path]) -> None:
    async with FakeSmtpServer(server_context(*cert)) as server:
        with pytest.raises(EmailDeliveryError, match="SSLCertVerificationError"):
            await sender(server.port, cert[0], trust=False).send(MESSAGE)
    assert server.auth_attempts == []


async def test_errors_carry_no_address_or_password(cert: tuple[Path, Path]) -> None:
    async with FakeSmtpServer(server_context(*cert), reject_recipients={"tester@example.com"}) as server:
        with pytest.raises(EmailDeliveryError) as rejected:
            await sender(server.port, cert[0]).send(MESSAGE)
        with pytest.raises(EmailDeliveryError, match=r"SMTPAuthenticationError \(535\)") as bad_login:
            await sender(server.port, cert[0], password="wrong-password").send(MESSAGE)
    for exc in (rejected.value, bad_login.value):
        assert "tester@example.com" not in str(exc)
        assert "password" not in str(exc)
        assert exc.__suppress_context__  # the original (with the server's reply) isn't chained into logs
    assert server.received == []


async def test_header_injection_is_refused_before_connecting(cert: tuple[Path, Path]) -> None:
    bad = EmailMessage(to="tester@example.com", subject="Hi\r\nBcc: someone@example.com", text="x")
    with pytest.raises(ValueError, match="linefeed or carriage return"):
        await sender(1, cert[0]).send(bad)  # port 1: nothing is contacted


def test_smtp_settings() -> None:
    s = settings_from(
        {"EMAIL_BACKEND": "smtp", "SMTP_HOST": "smtp.gmail.com", "SMTP_USERNAME": USER, "SMTP_PASSWORD": PASSWORD}
    )
    assert isinstance(create_email_sender(s), SmtpEmailSender)
    assert PASSWORD not in repr(s)
    with pytest.raises(ValidationError, match="needs SMTP_HOST"):
        settings_from({"EMAIL_BACKEND": "smtp"})
    with pytest.raises(ValidationError, match="go together"):
        settings_from({"EMAIL_BACKEND": "smtp", "SMTP_HOST": "h", "SMTP_USERNAME": USER})


def test_the_console_sender_is_refused_on_a_beta_server() -> None:
    beta = Settings.model_construct(**{**settings_from({}).__dict__, "app_env": "beta", "email_backend": "console"})
    with pytest.raises(RuntimeError, match="not allowed in beta"):
        create_email_sender(beta)
