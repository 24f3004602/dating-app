"""No personal data in logs; request IDs and access-log shape."""

from __future__ import annotations

import io
import json
import logging

import pytest
from httpx import AsyncClient

from app.logs import JsonFormatter, ScrubbingTextFormatter, request_id_var, scrub, truncate_ip

SECRETS = (
    "someone@example.com",
    "leaky.person@example.com",
    "dup.person@example.com",
    "hunter2hunter2",
    "s3cr3tTOKENvalue0123456789abcdefABCDEF",
    "Zx9-session-token-0123456789-abcdefghijkl",
    "correct horse battery",
)


def records(stream: io.StringIO) -> list[dict[str, object]]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


@pytest.mark.usefixtures("with_probes")
async def test_no_personal_data_in_logs_across_requests(client: AsyncClient, captured_logs: io.StringIO) -> None:
    auth = {"authorization": "Bearer Zx9-session-token-0123456789-abcdefghijkl"}
    await client.get("/healthz?email=someone@example.com", headers=auth)
    await client.get("/v1/unknown/someone@example.com")
    await client.post("/v1/_probe/echo", json={"email": "someone@example.com", "password": "short", "age": 1})
    await client.post(
        "/v1/_probe/echo", json={"email": "someone@example.com", "password": "correct horse battery", "age": 30}
    )
    assert (await client.get("/v1/_probe/boom", headers=auth)).status_code == 500
    assert (await client.post("/v1/_probe/duplicate-user")).status_code == 500

    output = captured_logs.getvalue()
    logged = records(captured_logs)
    # The test is meaningful only if the errors were actually logged.
    exc_types = {r.get("exc_type") for r in logged}
    assert {"RuntimeError", "IntegrityError"} <= exc_types
    for secret in SECRETS:
        assert secret not in output, f"{secret!r} leaked into logs"
    assert "?email" not in output


async def test_access_log_has_route_template_status_and_truncated_ip(
    client: AsyncClient, captured_logs: io.StringIO
) -> None:
    r = await client.get("/v1/unknown/thing?x=1")
    access = [rec for rec in records(captured_logs) if rec.get("event") == "http.request"]
    assert len(access) == 1
    entry = access[0]
    assert entry["route"] == "<unmatched>"
    assert entry["status"] == 404
    assert entry["method"] == "GET"
    assert entry["request_id"] == r.headers["x-request-id"]
    assert entry["client_ip"] == "127.0.0.0"  # httpx's test client is 127.0.0.1
    assert isinstance(entry["duration_ms"], float)

    await client.get("/healthz")
    access = [rec for rec in records(captured_logs) if rec.get("event") == "http.request"]
    assert access[-1]["route"] == "/healthz"


def test_formatter_drops_non_allowlisted_extra_fields() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "signup", None, None)
    record.email = "someone@example.com"  # not an allowed field
    record.event = "auth.signup"
    out = json.loads(JsonFormatter().format(record))
    assert out["event"] == "auth.signup"
    assert "email" not in out
    assert "someone@example.com" not in json.dumps(out)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("mail a.b+c@example.co.in now", "mail <email> now"),
        ("Authorization: Bearer abc.def-ghi", "Authorization: Bearer <redacted>"),
        ("token=abc123 password: hunter2", "token=<redacted> password: <redacted>"),
        (
            'duplicate key value violates unique constraint "uq_users_email_normalized"\n'
            "DETAIL:  Key (email_normalized)=(x@example.com) already exists.",
            'duplicate key value violates unique constraint "uq_users_email_normalized"\n'
            "DETAIL:  Key (email_normalized)=(<redacted>) already exists.",
        ),
        ("postgresql+psycopg://app:pa55word@db:5432/x", "postgresql+psycopg://app:***@db:5432/x"),
        ("opaque 3q2-7wEAAAAAAAAAbWFkZSB1cCB0b2tlbiB2YWx1ZQ", "opaque <token>"),
        # Record IDs (UUIDs) survive; a token glued to a UUID does not.
        ("user_id='75615d73-85ef-4e19-982f-37bdb50ba502'", "user_id='75615d73-85ef-4e19-982f-37bdb50ba502'"),
        ("75615d73-85ef-4e19-982f-37bdb50ba502abcdef0123", "<token>"),
        # Long code identifiers without digits survive, so tracebacks stay readable.
        ("in test_unknown_fields_are_rejected_everywhere", "in test_unknown_fields_are_rejected_everywhere"),
    ],
)
def test_scrub(raw: str, expected: str) -> None:
    assert scrub(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("203.0.113.77", "203.0.113.0"),
        ("2001:db8:abcd:12:1:2:3:4", "2001:db8:abcd::"),
        ("not-an-ip", None),
        (None, None),
    ],
)
def test_truncate_ip(raw: str | None, expected: str | None) -> None:
    assert truncate_ip(raw) == expected


def test_text_formatter_keeps_request_id_and_scrubs_message() -> None:
    token = request_id_var.set("4fcdc591-582d-4d28-9c41-a7ada5dd8f3c")
    try:
        record = logging.LogRecord("t", logging.INFO, __file__, 1, "hi someone@example.com", None, None)
        record.route = "/healthz"
        record.status = 200
        line = ScrubbingTextFormatter("%(levelname)s %(message)s").format(record)
    finally:
        request_id_var.reset(token)
    assert line == "INFO hi <email> route=/healthz status=200 rid=4fcdc591-582d-4d28-9c41-a7ada5dd8f3c"
