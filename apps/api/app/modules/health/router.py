"""Liveness (`/healthz`) and readiness (`/readyz`) probes."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.errors import problem_response
from app.schemas import ApiModel

logger = logging.getLogger("app.health")
router = APIRouter(tags=["health"])

CheckResult = Literal["ok", "fail"]


class Health(ApiModel):
    status: Literal["ok"]


class Readiness(ApiModel):
    status: Literal["ready"]
    checks: dict[str, CheckResult]


async def _check_database(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def _check_redis(redis: Redis) -> None:
    await redis.ping()


async def _run(name: str, check: Coroutine[Any, Any, None], limit_s: float) -> CheckResult:
    try:
        await asyncio.wait_for(check, timeout=limit_s)
    except Exception as exc:
        # Log only the exception type: driver messages can contain hostnames.
        logger.warning(
            "readiness check failed", extra={"event": "readiness.fail", "check": name, "error_type": type(exc).__name__}
        )
        return "fail"
    return "ok"


@router.get("/healthz", response_model=Health)
async def healthz() -> Health:
    return Health(status="ok")


@router.get(
    "/readyz",
    response_model=Readiness,
    responses={503: {"description": "A dependency is unreachable", "content": {"application/problem+json": {}}}},
)
async def readyz(request: Request) -> Readiness | JSONResponse:
    timeout = request.app.state.settings.readiness_timeout_s
    db, cache = await asyncio.gather(
        _run("database", _check_database(request.app.state.engine), timeout),
        _run("redis", _check_redis(request.app.state.redis), timeout),
    )
    checks: dict[str, CheckResult] = {"database": db, "redis": cache}
    if all(v == "ok" for v in checks.values()):
        return Readiness(status="ready", checks=checks)
    return problem_response(503, "not_ready", "A dependency is unavailable.", extra={"checks": checks})
