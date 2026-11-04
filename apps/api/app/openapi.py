"""OpenAPI: document errors as RFC 9457 problems (application/problem+json).

FastAPI documents 422 with its own `HTTPValidationError` shape by default;
our handler returns a problem document instead (D037). `problems()` declares
the real shapes per route, and `install_openapi()` moves them to the
problem+json media type and drops FastAPI's unused default schemas.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel, ConfigDict

PROBLEM_JSON = "application/problem+json"


class Problem(BaseModel):
    """RFC 9457 problem. Extension members (`checks`, `problems`, ...) may appear."""

    model_config = ConfigDict(extra="allow", title="Problem")
    type: str = "about:blank"
    title: str
    status: int
    code: str
    detail: str | None = None
    request_id: str | None = None


class FieldError(BaseModel):
    model_config = ConfigDict(extra="forbid", title="FieldError")
    field: str
    type: str
    message: str


class ValidationProblem(Problem):
    model_config = ConfigDict(extra="allow", title="ValidationProblem")
    errors: list[FieldError] = []


_DESCRIPTIONS = {
    400: "Rejected (see `code`)",
    401: "Not signed in, or bad credentials",
    403: "Not allowed (see `code`)",
    404: "Not found",
    413: "Request body too large",
    422: "Invalid request (`validation_error` lists the fields) or a rule failed (see `code`)",
    429: "Rate limited; see `Retry-After`",
    503: "A dependency (database, Redis) is unavailable",
}


def problems(*statuses: int) -> dict[int | str, dict[str, Any]]:
    return {
        s: {"model": ValidationProblem if s == 422 else Problem, "description": _DESCRIPTIONS.get(s, "Error")}
        for s in statuses
    }


def install_openapi(app: FastAPI) -> None:
    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        fastapi_default = "#/components/schemas/HTTPValidationError"
        for path_item in schema.get("paths", {}).values():
            for operation in path_item.values():
                for code, response in operation.get("responses", {}).items():
                    content = response.get("content", {})
                    if not (code.isdigit() and int(code) >= 400 and "application/json" in content):
                        continue
                    media = content.pop("application/json")
                    if media.get("schema", {}).get("$ref") == fastapi_default:
                        media = {"schema": {"$ref": "#/components/schemas/ValidationProblem"}}
                    content[PROBLEM_JSON] = media
        if "ValidationProblem" not in components:
            generated = ValidationProblem.model_json_schema(ref_template="#/components/schemas/{model}")
            components.update(generated.pop("$defs", {}))
            components["ValidationProblem"] = generated
        for unused in ("HTTPValidationError", "ValidationError"):
            components.pop(unused, None)
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
