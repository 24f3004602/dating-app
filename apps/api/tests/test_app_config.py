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


def settings_from(env: dict[str, str]) -> Settings:
    """Build Settings from explicit values only (no process env, no .env)."""
    base = {"DATABASE_URL": "postgresql+psycopg://u:p@h/d", "REDIS_URL": "redis://h"}
    return Settings.model_validate({**base, **env})


def test_secrets_never_render_in_repr() -> None:
    s = settings_from({"DATABASE_URL": "postgresql+psycopg://u:topsecret@h/d", "REDIS_URL": "redis://:alsosecret@h"})
    assert "topsecret" not in repr(s)
    assert "alsosecret" not in str(s.model_dump())


def test_production_rejects_debug_logging() -> None:
    with pytest.raises(ValidationError, match="DEBUG logging is not allowed in production"):
        settings_from({"APP_ENV": "production", "LOG_LEVEL": "DEBUG"})


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
    # Settings classes read the environment and must ignore unrelated variables.
    models = [
        m for m in _all_subclasses(BaseModel) if m.__module__.startswith("app.") and not issubclass(m, BaseSettings)
    ]
    assert models, "expected the app to define request/response models"
    for model in models:
        assert issubclass(model, ApiModel), f"{model.__module__}.{model.__name__} must subclass ApiModel"
        assert model.model_config.get("extra") == "forbid", model


async def test_openapi_schemas_forbid_additional_properties(client: AsyncClient) -> None:
    schemas = (await client.get("/v1/openapi.json")).json().get("components", {}).get("schemas", {})
    ours = {k: v for k, v in schemas.items() if k not in {"HTTPValidationError", "ValidationError"}}
    assert ours
    for name, schema in ours.items():
        if schema.get("type") == "object":
            assert schema.get("additionalProperties") is False, name
