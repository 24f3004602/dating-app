"""A minimal SMTP submission server for tests (stage 18): EHLO, STARTTLS,
AUTH PLAIN, MAIL, RCPT, DATA, QUIT, on asyncio streams, with a throwaway
self-signed certificate. It records what it saw so tests can check that the
password only ever travelled over TLS."""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import ssl
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

HOST = "127.0.0.1"


def make_certificate(directory: Path) -> tuple[Path, Path]:
    """A self-signed certificate for 127.0.0.1 and localhost."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "smtp-test")])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(HOST)), x509.DNSName("localhost")]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = directory / "cert.pem", directory / "key.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    return cert_path, key_path


@dataclass
class Received:
    mail_from: str
    rcpt_to: list[str]
    data: str


@dataclass
class FakeSmtpServer:
    server_context: ssl.SSLContext
    offer_starttls: bool = True
    implicit_tls: bool = False
    username: str = "beta-sender@example.com"
    password: str = "app-password-for-tests"
    reject_recipients: set[str] = field(default_factory=set)
    received: list[Received] = field(default_factory=list)
    auth_attempts: list[bool] = field(default_factory=list)  # whether each AUTH came over TLS
    port: int = 0
    _server: asyncio.Server | None = None

    async def __aenter__(self) -> FakeSmtpServer:
        self._server = await asyncio.start_server(
            self._session, HOST, 0, ssl=self.server_context if self.implicit_tls else None
        )
        self.port = self._server.sockets[0].getsockname()[1]
        return self

    async def __aexit__(self, *_: object) -> None:
        assert self._server is not None
        self._server.close()
        await self._server.wait_closed()

    async def _session(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:  # noqa: PLR0912 - a branch per verb
        tls = self.implicit_tls
        mail_from, rcpt = "", list[str]()

        async def say(*lines: str) -> None:
            writer.write("".join(f"{line}\r\n" for line in lines).encode())
            await writer.drain()

        try:
            await say("220 fake ESMTP")
            while line := (await reader.readline()).decode().rstrip("\r\n"):
                verb = line.split(" ", 1)[0].upper()
                if verb in {"EHLO", "HELO"}:
                    if not tls and self.offer_starttls:
                        await say("250-fake", "250 STARTTLS")
                    else:
                        await say("250-fake", "250 AUTH PLAIN")
                elif verb == "STARTTLS" and self.offer_starttls and not tls:
                    await say("220 ready")
                    await writer.start_tls(self.server_context)
                    tls = True
                elif verb == "AUTH":
                    self.auth_attempts.append(tls)
                    _, user, password = base64.b64decode(line.split()[2]).decode().split("\0")
                    if user == self.username and password == self.password:
                        await say("235 2.7.0 accepted")
                    else:
                        await say("535 5.7.8 credentials rejected")
                elif verb == "MAIL":
                    mail_from, rcpt = line.split(":", 1)[1].strip(" <>"), []
                    await say("250 ok")
                elif verb == "RCPT":
                    address = line.split(":", 1)[1].strip(" <>")
                    if address in self.reject_recipients:
                        await say(f"550 5.1.1 <{address}>: recipient rejected")
                    else:
                        rcpt.append(address)
                        await say("250 ok")
                elif verb == "DATA":
                    await say("354 go ahead")
                    body = (await reader.readuntil(b"\r\n.\r\n")).decode()[: -len("\r\n.\r\n")]
                    self.received.append(Received(mail_from, rcpt, body))
                    await say("250 queued")
                elif verb == "QUIT":
                    await say("221 bye")
                    break
                else:
                    await say("502 not implemented")
        except (ConnectionError, ssl.SSLError, asyncio.IncompleteReadError):
            pass  # the client gave up (for example on an untrusted certificate)
        finally:
            writer.close()


def server_context(cert: Path, key: Path) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    return ctx


def client_context(cert: Path) -> ssl.SSLContext:
    return ssl.create_default_context(cafile=str(cert))
