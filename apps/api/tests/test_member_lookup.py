"""The two-hour path, part 2 (stage 28e-2, D158): staff find the member an emailed complaint is
about, by address or by the first name and age the profile shows, and then act as they would on
a report. LOOKUP-1..4 in replica/test-plan.md."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select

from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from tests.chat import Db
from tests.members import Member, make_member
from tests.support import FrozenClock

SEARCH = "/v1/admin/members/search"


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-25T08:30:00+00:00")
    return clock.now


async def staff(app: FastAPI, db: Db, now: datetime) -> Member:
    return await make_member(db, app.state.storage, now, role="moderator", profile=False, session_client="web_admin")


async def email_of(db: Db, member: Member) -> str:
    async with db() as s:
        return str((await s.execute(select(User.email_normalized).where(User.id == member.id))).scalar_one())


async def lookups(db: Db) -> list[dict[str, Any]]:
    async with db() as s:
        rows = (await s.execute(select(AuditLog).where(AuditLog.action == "admin.member_lookup"))).scalars()
        return [dict(r.details) for r in rows]


async def test_by_address(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LOOKUP-1: the account, whatever the case of the address; what a report shows of it, never the
    address; audited with how and how many, never the address."""
    mod = await staff(app, db, now)
    meera = await make_member(db, app.state.storage, now, name="Meera", age=26, photos=("approved", "rejected"))
    address = await email_of(db, meera)
    r = await client.post(SEARCH, json={"email": f"  {address.upper()} "}, headers=mod.headers)
    assert r.status_code == 200, r.text
    [found] = r.json()
    assert (found["user_id"], found["display_name"], found["age"]) == (str(meera.id), "Meera", 26)
    assert [p["moderation_state"] for p in found["photos"]] == ["approved", "rejected"]
    assert address not in r.text
    assert "email" not in found
    assert await lookups(db) == [{"by": "email", "found": 1}]
    # Nobody with that address: an empty list, audited the same way.
    assert (await client.post(SEARCH, json={"email": "nobody@example.com"}, headers=mod.headers)).json() == []
    assert (await lookups(db))[-1] == {"by": "email", "found": 0}


async def test_by_first_name_and_age(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LOOKUP-2: the name as the profile shows it, in any case and with spaces around it, and the age
    shown; neither a longer name nor another age."""
    mod = await staff(app, db, now)
    first = await make_member(db, app.state.storage, now, name="Kabir", age=25)
    second = await make_member(db, app.state.storage, now, name="KABIR", age=25)
    await make_member(db, app.state.storage, now, name="Kabir", age=31)
    await make_member(db, app.state.storage, now, name="Kabira", age=25)
    r = await client.post(SEARCH, json={"name": " kabir ", "age": 25}, headers=mod.headers)
    assert r.status_code == 200, r.text
    assert {f["user_id"] for f in r.json()} == {str(first.id), str(second.id)}
    assert await lookups(db) == [{"by": "name", "found": 2}]


async def test_only_members_only_staff_only_one_way(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LOOKUP-3: staff accounts are never found; members can't search; one way at a time, checked."""
    mod = await staff(app, db, now)
    admin = await make_member(db, app.state.storage, now, role="admin", profile=False, session_client="web_admin")
    assert (await client.post(SEARCH, json={"email": await email_of(db, admin)}, headers=mod.headers)).json() == []
    member = await make_member(db, app.state.storage, now, name="Asha")  # an app session isn't a staff session
    assert (await client.post(SEARCH, json={"name": "Asha", "age": 28}, headers=member.headers)).status_code == 401
    for bad in (
        {},
        {"email": "a@example.com", "name": "Asha", "age": 28},
        {"name": "Asha"},
        {"age": 28},
        {"email": "not an address"},
        {"name": "   ", "age": 28},
        {"name": "x" * 41, "age": 28},
        {"name": "Asha", "age": 17},
    ):
        assert (await client.post(SEARCH, json=bad, headers=mod.headers)).status_code == 422, bad
    assert (await client.get(f"{SEARCH}?email=a@example.com", headers=mod.headers)).status_code == 405  # never in a URL


async def test_lookups_are_rate_limited(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """LOOKUP-4: 60 an hour for each staff member, so a stolen session can't walk the member list."""
    mod = await staff(app, db, now)
    statuses = [(await client.post(SEARCH, json={"name": "Nobody", "age": 30}, headers=mod.headers)).status_code
                for _ in range(61)]  # fmt: skip
    assert statuses == [200] * 60 + [429]
