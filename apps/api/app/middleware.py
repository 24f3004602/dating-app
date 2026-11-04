"""Pure ASGI middleware: request IDs, access log, body size limit, headers.

Pure ASGI (not BaseHTTPMiddleware) so the request ID context variable is
visible to everything below it, and so unhandled errors can still be answered
with a problem document that carries the request ID.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from http import HTTPStatus
from typing import Any

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import PROBLEM_JSON
from app.logs import request_id_var, truncate_ip

access_logger = logging.getLogger("app.access")
error_logger = logging.getLogger("app.errors")

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return str(value.decode("latin-1"))
    return None


def _problem_bytes(status: int, code: str, request_id: str) -> bytes:
    return json.dumps(
        {
            "type": "about:blank",
            "title": HTTPStatus(status).phrase,
            "status": status,
            "code": code,
            "request_id": request_id,
        }
    ).encode()


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, b"x-request-id")
        request_id = incoming if incoming and _SAFE_REQUEST_ID.fullmatch(incoming) else str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started_at = time.perf_counter()
        state: dict[str, Any] = {"status": 500, "started": False, "short_circuited": False}

        async def send_wrapper(message: Message) -> None:
            if state["short_circuited"] and not message.get("_ours"):
                return  # we already answered (413); drop the app's late response
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                state["started"] = True
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Cache-Control", "no-store")
            message.pop("_ours", None)
            await send(message)

        async def respond(status: int, code: str) -> None:
            body = _problem_bytes(status, code, request_id)
            await send_wrapper(
                {
                    "type": "http.response.start",
                    "status": status,
                    "headers": [(b"content-type", PROBLEM_JSON.encode()), (b"content-length", str(len(body)).encode())],
                    "_ours": True,
                }
            )
            await send_wrapper({"type": "http.response.body", "body": body, "_ours": True})

        received = 0

        async def receive_wrapper() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes and not state["started"]:
                    await respond(413, "payload_too_large")
                    state["short_circuited"] = True
                    return {"type": "http.disconnect"}
            return message

        try:
            declared = _header(scope, b"content-length")
            if declared is not None and declared.isdigit() and int(declared) > self.max_body_bytes:
                await respond(413, "payload_too_large")
                return
            await self.app(scope, receive_wrapper, send_wrapper)
        except Exception as exc:
            error_logger.error(
                "unhandled error",
                exc_info=exc,
                extra={"event": "http.unhandled_error", "error_type": type(exc).__name__},
            )
            if state["started"]:
                raise
            await respond(500, "internal_error")
        finally:
            route = scope.get("route")
            client = scope.get("client")
            access_logger.info(
                "request",
                extra={
                    "event": "http.request",
                    "method": scope.get("method"),
                    # The route template, never the raw path or query string.
                    "route": getattr(route, "path_format", None) or "<unmatched>",
                    "status": state["status"],
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                    "client_ip": truncate_ip(client[0] if client else None),
                },
            )
            request_id_var.reset(token)
