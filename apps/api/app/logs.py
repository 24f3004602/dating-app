"""Structured logging with request IDs and no personal data.

Two layers of protection:

1. Allow-listing: the access log records the route *template* (never the raw
   path or query string), the status, the duration and a truncated IP. Code
   logs events with explicit, non-personal fields.
2. Scrubbing (defence in depth): every rendered record is passed through
   `scrub()`, which masks email addresses, bearer tokens, long opaque tokens
   and the `Key (...)=(...)` detail PostgreSQL puts in constraint errors.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import re
import sys
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Extra fields a log call may attach. Anything else passed via `extra=` is
# dropped, so personal data cannot ride along by accident.
ALLOWED_FIELDS = frozenset(
    {
        "event",
        "method",
        "route",
        "status",
        "duration_ms",
        "client_ip",
        "check",
        "outcome",
        "error_type",
        "sqlstate",
        "constraint",
        "count",
        "revision",
    }
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_BEARER = re.compile(r"(?i)\b(bearer)(\s+)[^\s,;'\"]+")
_SECRET_ASSIGN = re.compile(
    r"(?i)\b(authorization|token|password|secret|code)(\s*[:=]\s*)(?!bearer\b|<redacted>)[^\s,;'\"]+"
)
# Opaque tokens and digests: 32+ URL-safe characters including a digit (so
# long code identifiers in tracebacks survive). A canonical UUID standing on
# its own is kept: record IDs are allowed in security logs (privacy inventory).
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![A-Za-z0-9_\-])"
_LONG_TOKEN = re.compile(rf"\b(?!{_UUID})(?=[A-Za-z_\-]*\d)[A-Za-z0-9_\-]{{32,}}\b")
_PG_KEY_DETAIL = re.compile(r"Key \((?P<cols>[^)]*)\)=\([^)]*\)")
_URL_PASSWORD = re.compile(r"(?P<scheme>[a-z][a-z0-9+.-]*://[^:/@\s]+):[^@\s]+@")


def scrub(text: str) -> str:
    text = _URL_PASSWORD.sub(r"\g<scheme>:***@", text)
    text = _PG_KEY_DETAIL.sub(r"Key (\g<cols>)=(<redacted>)", text)
    text = _EMAIL.sub("<email>", text)
    text = _BEARER.sub(r"\1\2<redacted>", text)
    text = _SECRET_ASSIGN.sub(r"\1\2<redacted>", text)
    return _LONG_TOKEN.sub("<token>", text)


def truncate_ip(raw: str | None) -> str | None:
    """IPv4 to /24 and IPv6 to /48, as the privacy inventory requires."""
    if not raw:
        return None
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return None
    prefix = 24 if ip.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False).network_address)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": scrub(record.getMessage()),
        }
        request_id = request_id_var.get()
        if request_id:
            payload["request_id"] = request_id
        for key in ALLOWED_FIELDS:
            if key in record.__dict__:
                value = record.__dict__[key]
                payload[key] = scrub(value) if isinstance(value, str) else value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc_type"] = record.exc_info[0].__name__
            payload["exc"] = scrub("".join(traceback.format_exception(*record.exc_info)))
        return json.dumps(payload, ensure_ascii=False, default=str)


class ScrubbingTextFormatter(logging.Formatter):
    """Human-readable format for local development; still scrubbed."""

    def format(self, record: logging.LogRecord) -> str:
        # Scrub the message and traceback; the request ID and allow-listed
        # fields are appended afterwards so the ID itself is not masked.
        line = scrub(super().format(record))
        fields = [f"{k}={scrub(str(record.__dict__[k]))}" for k in sorted(ALLOWED_FIELDS) if k in record.__dict__]
        rid = request_id_var.get()  # validated by the middleware: [A-Za-z0-9-]{8,64}
        if rid:
            fields.append(f"rid={rid}")
        return " ".join([line, *fields])


# Libraries whose INFO/DEBUG output can carry personal data: SQL parameters
# (sqlalchemy, psycopg) and full outbound URLs with query strings (httpx).
# LOG_LEVEL never lowers these below WARNING.
QUIET_LOGGERS = ("sqlalchemy", "psycopg", "alembic.runtime.migration", "httpx", "httpcore")


def quiet_library_loggers() -> None:
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


def configure_logging(level: str = "INFO", json_output: bool = True) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        JsonFormatter() if json_output else ScrubbingTextFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Uvicorn's own access log prints raw paths, query strings and full IPs.
    # Our middleware writes the access log instead.
    logging.getLogger("uvicorn.access").disabled = True
    quiet_library_loggers()
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers[:] = []
        logging.getLogger(name).propagate = True
