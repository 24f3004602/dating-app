"""Settings from the environment (and an optional, gitignored `.env`).

Secrets are `SecretStr` so they never appear in reprs or logs. Nothing here
has a production default for a secret: production must set every value.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    app_env: Literal["development", "test", "production"] = "development"
    # D019: code uses neutral identifiers; the brand name is configuration.
    brand_name: str = Field(default="Haanji", min_length=1, max_length=40)

    # Runtime connection: the app role (DML only, no DDL).
    database_url: SecretStr
    # Migration connection: the schema owner role. Used by Alembic only.
    migrations_database_url: SecretStr | None = None
    # Role that migrations grant DML privileges to.
    db_runtime_role: str = "app_runtime"
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_connect_timeout_s: float = Field(default=3.0, gt=0, le=30)

    redis_url: SecretStr
    redis_timeout_s: float = Field(default=1.0, gt=0, le=30)

    readiness_timeout_s: float = Field(default=2.0, gt=0, le=30)
    max_request_body_bytes: int = Field(default=1_048_576, ge=1024)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    @field_validator("db_runtime_role")
    @classmethod
    def _role_is_identifier(cls, v: str) -> str:
        if not _ROLE_NAME.fullmatch(v):
            raise ValueError("must be a lowercase PostgreSQL identifier")
        return v

    @model_validator(mode="after")
    def _production_rules(self) -> Settings:
        if self.app_env == "production" and self.log_level == "DEBUG":
            raise ValueError("DEBUG logging is not allowed in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def interactive_docs_enabled(self) -> bool:
        return not self.is_production


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # values come from the environment
