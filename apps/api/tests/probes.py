"""Test-only routes, mounted onto the app inside tests, never in production."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.auth.deps import client_ip
from app.schemas import ApiModel

router = APIRouter(prefix="/v1/_probe")


class ProbeIn(ApiModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)
    age: int = Field(ge=18, le=120)


class ProbeOut(ApiModel):
    ok: bool


@router.get("/ip")
async def ip(request: Request) -> dict[str, str]:
    return {"ip": client_ip(request)}


@router.post("/echo")
async def echo(body: ProbeIn) -> ProbeOut:
    return ProbeOut(ok=True)


@router.get("/items/{item_id}")
async def item(item_id: int) -> ProbeOut:
    return ProbeOut(ok=True)


@router.get("/conflict")
async def conflict() -> ProbeOut:
    raise ApiError(409, "already_exists", "That already exists.", headers={"Retry-After": "5"})


@router.get("/boom")
async def boom() -> ProbeOut:
    # A careless exception message holding personal data and a token.
    raise RuntimeError(
        "failed for leaky.person@example.com with token=s3cr3tTOKENvalue0123456789abcdefABCDEF password=hunter2hunter2"
    )


@router.post("/duplicate-user")
async def duplicate_user(session: Annotated[AsyncSession, Depends(get_session)]) -> ProbeOut:
    for _ in range(2):
        session.add(User(email_normalized="dup.person@example.com", password_hash="!", birthdate=date(1995, 1, 1)))
        await session.commit()
    return ProbeOut(ok=True)
