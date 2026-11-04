"""RFC 9457 error format, unknown-field rejection, request IDs, body limits."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response

PROBLEM_KEYS = {"type", "title", "status", "code", "request_id"}
VALID = {"email": "someone@example.com", "password": "correct horse battery", "age": 30}

pytestmark = pytest.mark.usefixtures("with_probes")


def assert_problem(r: object, status: int, code: str) -> dict[str, object]:
    assert isinstance(r, Response)
    assert r.status_code == status, r.text
    assert r.headers["content-type"] == "application/problem+json"
    body = r.json()
    assert body.keys() >= PROBLEM_KEYS
    assert body["type"] == "about:blank"
    assert body["status"] == status
    assert body["code"] == code
    assert body["request_id"] == r.headers["x-request-id"]
    assert "Traceback" not in r.text
    return dict(body)


async def test_unknown_route_is_a_404_problem(client: AsyncClient) -> None:
    body = assert_problem(await client.get("/v1/does-not-exist"), 404, "not_found")
    assert body["title"] == "Not Found"


async def test_wrong_method_is_a_405_problem(client: AsyncClient) -> None:
    assert_problem(await client.delete("/healthz"), 405, "method_not_allowed")


async def test_api_error_carries_code_detail_and_headers(client: AsyncClient) -> None:
    r = await client.get("/v1/_probe/conflict")
    body = assert_problem(r, 409, "already_exists")
    assert body["detail"] == "That already exists."
    assert r.headers["retry-after"] == "5"


async def test_validation_error_lists_fields_without_echoing_values(client: AsyncClient) -> None:
    r = await client.post("/v1/_probe/echo", json={"email": "someone@example.com", "password": "short", "age": 12})
    body = assert_problem(r, 422, "validation_error")
    fields = {e["field"] for e in body["errors"]}  # type: ignore[attr-defined]
    assert fields == {"body.password", "body.age"}
    # The submitted values never come back (they could be secrets).
    assert "short" not in r.text.replace("string_too_short", "")
    assert "someone@example.com" not in r.text


async def test_path_parameter_validation_is_a_problem(client: AsyncClient) -> None:
    body = assert_problem(await client.get("/v1/_probe/items/not-a-number"), 422, "validation_error")
    assert body["errors"][0]["field"] == "path.item_id"  # type: ignore[index]


async def test_malformed_json_is_a_problem(client: AsyncClient) -> None:
    r = await client.post("/v1/_probe/echo", content=b"{not json", headers={"content-type": "application/json"})
    assert_problem(r, 422, "validation_error")


async def test_unknown_fields_are_rejected(client: AsyncClient) -> None:
    r = await client.post("/v1/_probe/echo", json={**VALID, "is_admin": True})
    body = assert_problem(r, 422, "validation_error")
    assert body["errors"] == [
        {"field": "body.is_admin", "type": "extra_forbidden", "message": "Extra inputs are not permitted"}
    ]
    assert (await client.post("/v1/_probe/echo", json=VALID)).json() == {"ok": True}


async def test_unhandled_error_is_a_generic_500(client: AsyncClient) -> None:
    r = await client.get("/v1/_probe/boom")
    body = assert_problem(r, 500, "internal_error")
    assert "detail" not in body
    assert "leaky.person" not in r.text
    assert "RuntimeError" not in r.text


async def test_request_id_is_generated_and_safe_incoming_ids_are_kept(client: AsyncClient) -> None:
    generated = (await client.get("/healthz")).headers["x-request-id"]
    uuid.UUID(generated)
    kept = await client.get("/healthz", headers={"x-request-id": "mobile-abc-12345"})
    assert kept.headers["x-request-id"] == "mobile-abc-12345"
    unsafe = await client.get("/healthz", headers={"x-request-id": "evil id with spaces"})
    uuid.UUID(unsafe.headers["x-request-id"])
    too_long = await client.get("/healthz", headers={"x-request-id": "a" * 65})
    uuid.UUID(too_long.headers["x-request-id"])


async def test_security_headers_on_every_response(client: AsyncClient) -> None:
    for r in (await client.get("/healthz"), await client.get("/v1/nope")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["cache-control"] == "no-store"


async def test_declared_oversized_body_is_rejected_with_413(app: FastAPI, client: AsyncClient) -> None:
    limit = app.state.settings.max_request_body_bytes
    r = await client.post("/v1/_probe/echo", content=b"x" * (limit + 1), headers={"content-type": "application/json"})
    assert_problem(r, 413, "payload_too_large")


async def test_streamed_oversized_body_is_rejected_with_413(app: FastAPI, client: AsyncClient) -> None:
    limit = app.state.settings.max_request_body_bytes

    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(limit // 65536 + 2):
            yield b"x" * 65536

    r = await client.post("/v1/_probe/echo", content=chunks(), headers={"content-type": "application/json"})
    assert "content-length" not in r.request.headers
    assert_problem(r, 413, "payload_too_large")
