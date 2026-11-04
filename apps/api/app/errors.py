"""RFC 9457 problem details for every error response.

`type` is `about:blank`, so `title` is the HTTP status phrase. Clients key on
the stable `code` extension member. Validation errors list the failing fields
but never echo the submitted values (they may be passwords or emails).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logs import request_id_var

logger = logging.getLogger("app.errors")

PROBLEM_JSON = "application/problem+json"

_STATUS_CODES: Mapping[int, str] = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    406: "not_acceptable",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}


class ApiError(Exception):
    """Raise from routes and services for an expected, client-facing error."""

    def __init__(
        self,
        status: int,
        code: str,
        detail: str | None = None,
        *,
        headers: Mapping[str, str] | None = None,
        extra: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.detail = detail
        self.headers = dict(headers or {})
        self.extra = dict(extra or {})


def problem_response(
    status: int,
    code: str,
    detail: str | None = None,
    *,
    headers: Mapping[str, str] | None = None,
    extra: Mapping[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code,
    }
    if detail:
        body["detail"] = detail
    request_id = request_id_var.get()
    if request_id:
        body["request_id"] = request_id
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON, headers=headers)


def _field_errors(errors: Sequence[Any]) -> list[dict[str, str]]:
    out = []
    for err in errors:
        loc = ".".join(str(p) for p in err.get("loc", ()))
        # Deliberately omit err["input"] and err["ctx"]: they can hold the
        # submitted value.
        out.append({"field": loc, "type": str(err.get("type", "invalid")), "message": str(err.get("msg", ""))})
    return out


async def _api_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ApiError):  # registered for ApiError only; never trust that blindly
        return await _unhandled_error(request, exc)
    return problem_response(exc.status, exc.code, exc.detail, headers=exc.headers, extra=exc.extra)


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(
        exc, StarletteHTTPException
    ):  # registered for StarletteHTTPException only; never trust that blindly
        return await _unhandled_error(request, exc)
    code = _STATUS_CODES.get(exc.status_code, "error")
    # Starlette's default details are the status phrase; don't repeat them.
    detail = exc.detail if isinstance(exc.detail, str) and exc.detail != HTTPStatus(exc.status_code).phrase else None
    return problem_response(exc.status_code, code, detail, headers=exc.headers)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(
        exc, RequestValidationError
    ):  # registered for RequestValidationError only; never trust that blindly
        return await _unhandled_error(request, exc)
    return problem_response(
        422,
        "validation_error",
        "The request is invalid.",
        extra={"errors": _field_errors(exc.errors())},
    )


async def _unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled error", exc_info=exc, extra={"event": "http.unhandled_error", "error_type": type(exc).__name__}
    )
    return problem_response(500, "internal_error")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
