"""Application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis

from app.clock import system_clock
from app.config import Settings, get_settings
from app.db import create_engine, create_session_factory
from app.errors import install_error_handlers
from app.jobs import JobQueue, get_job_app
from app.logs import configure_logging
from app.middleware import RequestContextMiddleware
from app.modules.accounts.router import router as accounts_router
from app.modules.auth.crypto import derive_key
from app.modules.auth.passwords import Passwords
from app.modules.auth.router import router as auth_router
from app.modules.auth.service import AuthContext
from app.modules.health.router import router as health_router
from app.modules.media.router import router as media_router
from app.modules.profiles.router import router as profiles_router
from app.openapi import install_openapi
from app.providers.identity import NoIdentityVerifier
from app.providers.storage import create_storage
from app.ratelimit import RateLimiter

API_PREFIX = "/v1"


def create_app(settings: Settings | None = None, *, configure_logs: bool = True) -> FastAPI:
    settings = settings or get_settings()
    if configure_logs:
        configure_logging(settings.log_level, settings.log_json)

    # Engine and Redis client are lazy: nothing connects until first use, so
    # the app starts (and /healthz answers) even when a dependency is down.
    engine = create_engine(settings)
    redis = Redis.from_url(
        settings.redis_url.get_secret_value(),
        socket_connect_timeout=settings.redis_timeout_s,
        socket_timeout=settings.redis_timeout_s,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await redis.aclose()
        await engine.dispose()

    app = FastAPI(
        title=f"{settings.brand_name} API",
        version="0.1.0",
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs" if settings.interactive_docs_enabled else None,
        redoc_url=None,
        swagger_ui_oauth2_redirect_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.redis = redis
    app.state.identity = NoIdentityVerifier()
    app.state.storage = create_storage(settings, derive_key(settings.app_secret_key.get_secret_value(), "media-url"))
    app.state.auth = AuthContext(
        settings=settings,
        passwords=Passwords(settings.password_hash_profile),
        limiter=RateLimiter(
            redis, derive_key(settings.app_secret_key.get_secret_value(), "rate-limit"), settings.rate_limit_prefix
        ),
        jobs=JobQueue(get_job_app()),
        clock=system_clock,
    )

    install_error_handlers(app)
    app.add_middleware(
        RequestContextMiddleware,
        max_body_bytes=settings.max_request_body_bytes,
        # Photo uploads may be larger than the general limit.
        body_limit_overrides={("POST", f"{API_PREFIX}/me/photos"): settings.max_upload_body_bytes},
    )

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(accounts_router)
    app.include_router(profiles_router)
    app.include_router(media_router)
    install_openapi(app)
    return app
