"""Settings from the environment (and an optional, gitignored `.env`).

Secrets are `SecretStr` so they never appear in reprs or logs. Nothing here
has a production default for a secret: production must set every value.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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

    # Browser origins allowed to call the API (the Expo web build, later the
    # admin console). Exact origins only; empty means no CORS at all. The
    # mobile app is not a browser and needs none.
    cors_origins: list[str] = Field(default_factory=list)

    # Server secret for keyed hashes (one-time codes, rate-limit keys). At
    # least 32 characters; rotating it invalidates live codes only.
    app_secret_key: SecretStr = Field(min_length=32)
    # "Today" for age checks and daily limits (D014, architecture).
    app_timezone: str = "Asia/Kolkata"

    # Auth (stage 6). Password rules follow NIST SP 800-63B-4 (D042).
    password_min_length: int = Field(default=15, ge=15, le=64)
    password_max_length: int = Field(default=128, ge=64, le=1024)
    # "test" uses cheap Argon2 parameters so the suite runs fast. Never in production.
    password_hash_profile: Literal["rfc9106_low_memory", "test"] = "rfc9106_low_memory"  # noqa: S105 - a profile name
    code_ttl_s: int = Field(default=600, ge=60, le=900)
    code_max_attempts: int = Field(default=5, ge=1, le=10)
    session_ttl_days: int = Field(default=30, ge=1, le=90)
    # A session's sliding expiry is refreshed at most this often.
    session_touch_interval_s: int = Field(default=900, ge=60)
    # Consecutive failed logins before password sign-in is locked until a reset.
    login_lockout_threshold: int = Field(default=100, ge=10, le=100)
    rate_limit_prefix: str = Field(default="rl", pattern=r"^[a-z0-9:_-]{1,40}$")

    # Versions of the documents a member accepts at sign-up. "draft-" versions
    # mark documents that have not had legal review; production refuses them.
    terms_version: str = Field(default="draft-2026-11", max_length=32)
    privacy_version: str = Field(default="draft-2026-11", max_length=32)

    # Providers (D044). "console" prints mail to stdout (development only);
    # "memory" keeps it in process (tests). A real adapter arrives with the
    # owner's provider account.
    email_backend: Literal["console", "memory"] = "console"
    email_from: str = Field(default="no-reply@example.invalid", max_length=254)

    # Media (stage 7). "local" writes under media_dir (development); "memory"
    # is for tests. Production needs a private bucket adapter (owner setup).
    storage_backend: Literal["local", "memory"] = "local"
    media_dir: str = "var/media"
    media_url_ttl_s: int = Field(default=300, ge=30, le=3600)
    # D026: photos are hidden from others until a moderator approves them.
    photo_review_required: bool = True
    photo_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1024)
    photo_max_pixels: int = Field(default=40_000_000, ge=1_000_000)
    photo_min_side: int = Field(default=300, ge=100)
    photo_max_count: int = Field(default=6, ge=1, le=6)

    # Discovery (stage 8): the size of the finite daily set (D014).
    discovery_set_size: int = Field(default=15, ge=1, le=50)
    # Upload requests may exceed the general body limit (multipart overhead included).
    max_upload_body_bytes: int = Field(default=11 * 1024 * 1024, ge=1024)

    @field_validator("db_runtime_role")
    @classmethod
    def _role_is_identifier(cls, v: str) -> str:
        if not _ROLE_NAME.fullmatch(v):
            raise ValueError("must be a lowercase PostgreSQL identifier")
        return v

    @field_validator("cors_origins")
    @classmethod
    def _exact_origins(cls, v: list[str]) -> list[str]:
        for origin in v:
            if origin == "*" or not origin.startswith(("http://", "https://")) or origin.rstrip("/") != origin:
                raise ValueError("CORS origins must be exact http(s) origins, never '*'")
        return v

    @field_validator("app_timezone")
    @classmethod
    def _known_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("unknown time zone") from exc
        return v

    @model_validator(mode="after")
    def _production_rules(self) -> Settings:
        if self.app_env != "production":
            return self
        problems = []
        if self.log_level == "DEBUG":
            problems.append("DEBUG logging is not allowed in production")
        if self.password_hash_profile == "test":  # noqa: S105 - a profile name
            problems.append("the test password-hash profile is not allowed in production")
        if self.email_backend in {"console", "memory"}:
            problems.append("a real email backend is required in production")
        if self.storage_backend in {"local", "memory"}:
            problems.append("a private object-storage bucket is required in production")
        if self.terms_version.startswith("draft-") or self.privacy_version.startswith("draft-"):
            problems.append("terms and privacy documents need final (non-draft) versions in production")
        if problems:
            raise ValueError("; ".join(problems))
        return self

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.app_timezone)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def interactive_docs_enabled(self) -> bool:
        return not self.is_production


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # values come from the environment
