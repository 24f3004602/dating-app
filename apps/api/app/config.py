"""Settings from the environment (and an optional, gitignored `.env`).

Secrets are `SecretStr` so they never appear in reprs or logs. Nothing here
has a production default for a secret: production must set every value.
"""

from __future__ import annotations

import ipaddress
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

    # "beta" (stage 18, D096): a small invite-only test with real people on one
    # server. Every production rule applies, except that photos may stay on the
    # server's disk and the documents may be the plain-language beta notice.
    app_env: Literal["development", "test", "beta", "production"] = "development"
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

    # Proxies whose X-Forwarded-For uvicorn believes (stage 17): the load
    # balancer, and the console's server. Addresses or networks, never "*".
    # Empty means forwarded headers are ignored and the client IP is the socket's.
    trusted_proxies: list[str] = Field(default_factory=list)

    # The public website's origin (stage 20c, D101): links in waitlist emails
    # point here. https on a server people use.
    site_url: str = "http://localhost:3000"

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
    # Namespace for every Redis key and channel (rate limits and realtime).
    rate_limit_prefix: str = Field(default="rl", pattern=r"^[a-z0-9:_-]{1,40}$")

    # Versions of the documents a member accepts at sign-up. "draft-" versions
    # mark documents that have not had legal review; production refuses them.
    terms_version: str = Field(default="draft-2026-11", max_length=32)
    privacy_version: str = Field(default="draft-2026-11", max_length=32)

    # Providers (D044). "console" prints mail to stdout (development only);
    # "memory" keeps it in process (tests); "smtp" sends through any SMTP
    # submission server, always over TLS (stage 18; a Gmail app password for the
    # beta, a provider's SMTP credentials later).
    email_backend: Literal["console", "memory", "smtp"] = "console"
    email_from: str = Field(default="no-reply@example.invalid", max_length=254)
    smtp_host: str | None = Field(default=None, max_length=253)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    # "starttls" (port 587) or "tls" (implicit TLS, port 465). Never plaintext.
    smtp_security: Literal["starttls", "tls"] = "starttls"
    smtp_username: str | None = Field(default=None, max_length=254)
    smtp_password: SecretStr | None = None
    smtp_timeout_s: float = Field(default=15.0, gt=0, le=120)

    # Invite-only sign-up (stage 18, D096): only emails on the invite list can
    # create an account. Required in beta. Invites expire after this many days.
    signup_invite_only: bool = False
    invite_days: int = Field(default=30, ge=1, le=90)

    # Push notifications (stage 16, D093). "none" sends nothing (the default until
    # the owner's EAS project exists); "memory" is for tests; "expo" uses Expo's
    # push service, with an access token if "enhanced push security" is on.
    push_backend: Literal["none", "memory", "expo"] = "none"
    expo_access_token: SecretStr | None = None

    # Payments (stage 16b, D094): sandbox only. "none" refuses checkouts (the
    # default); "fake" is for tests; "razorpay" needs the owner's account. Live
    # keys (rzp_live_...) are refused unless payments_live is set: no live
    # payments without the owner's authorization (CLAUDE.md).
    payments_backend: Literal["none", "fake", "razorpay"] = "none"
    razorpay_key_id: str | None = Field(default=None, max_length=64)
    razorpay_key_secret: SecretStr | None = None
    razorpay_webhook_secret: SecretStr | None = None
    razorpay_plan_id: str | None = Field(default=None, max_length=64)
    payments_live: bool = False

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
    # The same for every member, never sold (D015, fixes.md differentiator 3).
    daily_like_limit: int = Field(default=10, ge=1, le=50)
    # Messaging (stage 10, D073): likes pause while this many chats await your
    # reply (the other person wrote last, within the window).
    your_turn_cap: int = Field(default=5, ge=1, le=50)
    your_turn_window_days: int = Field(default=7, ge=1, le=60)
    # Realtime (D025, D074): single-use tickets, heartbeats, re-checks of the
    # session behind a long-lived connection, connections per member.
    realtime_ticket_ttl_s: int = Field(default=30, ge=5, le=120)
    realtime_heartbeat_s: float = Field(default=25.0, gt=0, le=60)
    realtime_revalidate_s: float = Field(default=120.0, gt=0, le=900)
    realtime_max_connections: int = Field(default=5, ge=1, le=20)
    # Staff (stage 14, D090): separate web_admin sessions after two-factor sign-in,
    # absolute expiry and an idle timeout; sign-in challenges and enrolment tokens.
    staff_session_hours: int = Field(default=12, ge=1, le=24)
    staff_idle_minutes: int = Field(default=30, ge=5, le=120)
    staff_challenge_ttl_s: int = Field(default=300, ge=60, le=900)
    staff_enrollment_hours: int = Field(default=24, ge=1, le=72)
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

    @field_validator("site_url")
    @classmethod
    def _site_origin(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")) or v.rstrip("/") != v or "?" in v or "#" in v:
            raise ValueError("SITE_URL must be an http(s) URL with no trailing slash")
        return v

    @field_validator("trusted_proxies")
    @classmethod
    def _proxy_addresses(cls, v: list[str]) -> list[str]:
        for entry in v:
            try:
                ipaddress.ip_network(entry, strict=False)
            except ValueError as exc:
                raise ValueError("trusted proxies are IP addresses or networks, never '*'") from exc
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
    def _payment_rules(self) -> Settings:
        if self.razorpay_key_id and self.razorpay_key_id.startswith("rzp_live_") and not self.payments_live:
            raise ValueError("live Razorpay keys need PAYMENTS_LIVE=true: live payments need the owner's authorization")
        if self.payments_backend == "razorpay" and not (
            self.razorpay_key_id and self.razorpay_key_secret and self.razorpay_webhook_secret and self.razorpay_plan_id
        ):
            raise ValueError("the razorpay backend needs a key ID, key secret, webhook secret and plan ID")
        return self

    @model_validator(mode="after")
    def _smtp_rules(self) -> Settings:
        if self.email_backend == "smtp" and not self.smtp_host:
            raise ValueError("the smtp email backend needs SMTP_HOST")
        if (self.smtp_username is None) != (self.smtp_password is None):
            raise ValueError("SMTP_USERNAME and SMTP_PASSWORD go together")
        return self

    @model_validator(mode="after")
    def _production_rules(self) -> Settings:
        """Rules for a server real people use: production, and the beta (D096)."""
        if not self.is_deployed:
            return self
        env = self.app_env
        versions = (self.terms_version, self.privacy_version)
        checks = [
            (self.log_level == "DEBUG", f"DEBUG logging is not allowed in {env}"),
            (self.password_hash_profile == "test", f"the test password-hash profile is not allowed in {env}"),  # noqa: S105
            (self.email_backend in {"console", "memory"}, f"a real email backend is required in {env}"),
            # The beta may keep photos on the server's own disk; production needs the bucket.
            (
                self.storage_backend == "memory" or (self.storage_backend == "local" and env == "production"),
                f"a private object-storage bucket is required in {env}",
            ),
            (
                any(v.startswith("draft-") for v in versions),
                f"terms and privacy documents need final (non-draft) versions in {env}",
            ),
            (
                env == "production" and any(v.startswith("beta-") for v in versions),
                "the beta notice is not the final terms and privacy notice",
            ),
            # Stage 17: test-only backends and plain-HTTP browser origins never reach a server.
            (self.push_backend == "memory", "the memory push backend is for tests only"),
            (self.payments_backend == "fake", "the fake payments backend is for tests only"),
            (
                any(not origin.startswith("https://") for origin in self.cors_origins),
                f"CORS origins must be https in {env}",
            ),
            (not self.site_url.startswith("https://"), f"SITE_URL must be https in {env}"),
            (env == "beta" and not self.signup_invite_only, "the beta is invite-only (SIGNUP_INVITE_ONLY=true)"),
            (env == "beta" and self.payments_live, "no live payments in the beta"),
        ]
        problems = [problem for failed, problem in checks if failed]
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
    def is_deployed(self) -> bool:
        """A server real people use (beta or production): no fixtures, no dev mail."""
        return self.app_env in {"beta", "production"}

    @property
    def interactive_docs_enabled(self) -> bool:
        return not self.is_deployed


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # values come from the environment
