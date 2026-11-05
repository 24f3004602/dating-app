"""Settings, OpenAPI exposure and request-model conventions."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, ValidationError
from pydantic_settings import BaseSettings

import app.main
from app.config import Settings
from app.main import create_app
from app.schemas import ApiModel
from tests.conftest import MigratedDatabase, close_app


def settings_from(env: dict[str, object]) -> Settings:
    """Build Settings from explicit values only (no process env, no .env)."""
    base = {
        "DATABASE_URL": "postgresql+psycopg://u:p@h/d",
        "REDIS_URL": "redis://h",
        "APP_SECRET_KEY": "x" * 32,
    }
    return Settings.model_validate({**base, **env})


def test_secrets_never_render_in_repr() -> None:
    s = settings_from({"DATABASE_URL": "postgresql+psycopg://u:topsecret@h/d", "REDIS_URL": "redis://:alsosecret@h"})
    assert "topsecret" not in repr(s)
    assert "alsosecret" not in str(s.model_dump())


def test_production_rejects_debug_logging() -> None:
    with pytest.raises(ValidationError, match="DEBUG logging is not allowed in production"):
        settings_from({"APP_ENV": "production", "LOG_LEVEL": "DEBUG"})


@pytest.mark.parametrize(
    ("extra", "problem"),
    [
        ({"PUSH_BACKEND": "memory"}, "the memory push backend is for tests only"),
        ({"PAYMENTS_BACKEND": "fake"}, "the fake payments backend is for tests only"),
        ({"CORS_ORIGINS": ["http://console.example.in"]}, "CORS origins must be https in production"),
    ],
)
def test_production_rejects_test_backends_and_plain_http_origins(extra: dict[str, object], problem: str) -> None:
    with pytest.raises(ValidationError, match=problem):
        settings_from({"APP_ENV": "production", **extra})


@pytest.mark.parametrize("role", ["App", "drop table", "x;y", ""])
def test_runtime_role_must_be_a_plain_identifier(role: str) -> None:
    with pytest.raises(ValidationError, match="db_runtime_role"):
        settings_from({"DB_RUNTIME_ROLE": role})


async def test_openapi_is_served_under_v1(client: AsyncClient) -> None:
    r = await client.get("/v1/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"].endswith("API")
    assert (await client.get("/openapi.json")).status_code == 404


@pytest.mark.parametrize(("env", "docs_status"), [("development", 200), ("test", 200), ("production", 404)])
async def test_interactive_docs_only_outside_production(test_db: MigratedDatabase, env: str, docs_status: int) -> None:
    application = create_app(test_db.settings.model_copy(update={"app_env": env}), configure_logs=False)
    try:
        async with AsyncClient(transport=ASGITransport(app=application), base_url="http://testserver") as c:
            assert (await c.get("/v1/docs")).status_code == docs_status
            assert (await c.get("/docs")).status_code == 404
            assert (await c.get("/redoc")).status_code == 404
    finally:
        await close_app(application)


def _all_subclasses(cls: type) -> set[type]:
    found: set[type] = set()
    sub: type
    for sub in cls.__subclasses__():
        found |= {sub, *_all_subclasses(sub)}
    return found


def test_every_app_model_forbids_unknown_fields() -> None:
    assert app.main  # imports every router and its models
    # Settings classes read the environment and must ignore unrelated variables;
    # app.openapi models only document error responses (RFC 9457 allows
    # extension members) and never parse input.
    models = [
        m
        for m in _all_subclasses(BaseModel)
        if m.__module__.startswith("app.") and m.__module__ != "app.openapi" and not issubclass(m, BaseSettings)
    ]
    assert models, "expected the app to define request/response models"
    for model in models:
        assert issubclass(model, ApiModel), f"{model.__module__}.{model.__name__} must subclass ApiModel"
        assert model.model_config.get("extra") == "forbid", model


async def test_openapi_schemas_forbid_additional_properties(client: AsyncClient) -> None:
    schemas = (await client.get("/v1/openapi.json")).json().get("components", {}).get("schemas", {})
    assert "HTTPValidationError" not in schemas  # replaced by our problem documents
    ours = {k: v for k, v in schemas.items() if k not in {"Problem", "ValidationProblem"}}
    assert ours
    for name, schema in ours.items():
        if schema.get("type") == "object":
            assert schema.get("additionalProperties") is False, name


async def test_cors_is_off_by_default_and_exact_when_on(test_db: MigratedDatabase) -> None:
    for origins, origin, allowed in (
        ([], "http://localhost:8081", False),
        (["http://localhost:8081"], "http://localhost:8081", True),
        (["http://localhost:8081"], "http://evil.example", False),
    ):
        application = create_app(test_db.settings.model_copy(update={"cors_origins": origins}), configure_logs=False)
        try:
            async with AsyncClient(transport=ASGITransport(app=application), base_url="http://testserver") as c:
                r = await c.options(
                    "/v1/auth/login",
                    headers={"origin": origin, "access-control-request-method": "POST",
                             "access-control-request-headers": "content-type"},
                )  # fmt: skip
                assert (r.headers.get("access-control-allow-origin") == origin) is allowed, (origins, origin)
                assert "access-control-allow-credentials" not in r.headers
        finally:
            await close_app(application)


@pytest.mark.parametrize("origin", ["*", "localhost:8081", "http://localhost:8081/"])
def test_cors_origins_must_be_exact(origin: str) -> None:
    with pytest.raises(ValidationError, match="exact"):
        settings_from({"CORS_ORIGINS": [origin]})
