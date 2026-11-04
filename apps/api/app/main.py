"""Application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis

from app.config import Settings, get_settings
from app.db import create_engine, create_session_factory
from app.errors import install_error_handlers
from app.logs import configure_logging
from app.middleware import RequestContextMiddleware
from app.modules.health.router import router as health_router

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

    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, max_body_bytes=settings.max_request_body_bytes)

    app.include_router(health_router)
    # Feature routers mount under API_PREFIX from stage 6 on.
    return app
