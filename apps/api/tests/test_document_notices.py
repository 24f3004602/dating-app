"""Notices of new documents and the reminder of the rules (stage 28f, D159): the terms and privacy
notice promise members are told in the app when the documents change, and India's IT Rules
(rule 3(1)(c)) ask for a reminder of the rules at least every three months. NOTICE-1..4."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.modules.accounts.models import Consent, ConsentKind
from app.modules.audit.models import AuditLog
from app.modules.notifications.models import MemberNotice, NoticeKind
from app.modules.notifications.service import send_document_and_rule_notices
from tests.chat import Db
from tests.members import Member, add, make_member
from tests.support import FrozenClock

OLD, NEW = "beta-2026-11-20", "beta-2026-11-25"


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-26T03:30:00+00:00")  # the job's daily tick, 09:00 in India
    return clock.now


@pytest.fixture
def settings(app: FastAPI) -> Settings:
    s: Settings = app.state.settings
    return s.model_copy(update={"terms_version": NEW, "privacy_version": NEW})


async def member(app: FastAPI, db: Db, at: datetime, version: str | None, **kw: Any) -> Member:
    m = await make_member(db, app.state.storage, at, **kw)
    if version is not None:
        await add(db, *(Consent(user_id=m.id, kind=k, version=version, granted_at=at) for k in ConsentKind))
    return m


async def notices(db: Db, m: Member) -> list[tuple[str, str | None, datetime]]:
    async with db() as s:
        rows = await s.execute(
            select(MemberNotice).where(MemberNotice.user_id == m.id).order_by(MemberNotice.created_at)
        )
        return [(n.kind.value, n.version, n.created_at) for n in rows.scalars()]


async def run(db: Db, settings: Settings, at: datetime) -> tuple[int, int]:
    async with db() as s:
        return await send_document_and_rule_notices(s, settings, at)


async def test_members_who_agreed_to_older_documents_hear_once(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, settings: Settings
) -> None:
    """NOTICE-1: once per version, to active members who agreed to an older one; never to someone
    who agreed to this one, a suspended or leaving account, or staff. The app gets the version."""
    joined = now - timedelta(days=10)
    earlier = await member(app, db, joined, OLD)
    current = await member(app, db, joined, NEW)
    suspended = await member(app, db, joined, OLD, status="suspended")
    leaving = await member(app, db, joined, OLD, deletion_requested=True)
    staff = await member(app, db, joined, OLD, role="moderator", profile=False)

    assert await run(db, settings, now) == (1, 0)
    assert await notices(db, earlier) == [("new_documents", NEW, now)]
    for nobody in (current, suspended, leaving, staff):
        assert await notices(db, nobody) == []
    assert await run(db, settings, now + timedelta(days=1)) == (0, 0)  # told once

    r = await client.get("/v1/me/notices", headers=earlier.headers)
    assert [(n["kind"], n["version"], n["read"]) for n in r.json()] == [("new_documents", NEW, False)]

    # The next version is announced again, to everyone who agreed to an earlier one.
    later = settings.model_copy(update={"terms_version": "beta-2026-12-10", "privacy_version": "beta-2026-12-10"})
    assert await run(db, later, now + timedelta(days=2)) == (2, 0)
    assert [v for _, v, _ in await notices(db, earlier)] == [NEW, "beta-2026-12-10"]


async def test_the_rules_reach_everyone_every_90_days(app: FastAPI, db: Db, now: datetime, settings: Settings) -> None:
    """NOTICE-2: 90 days after joining, after the last reminder, or after a notice of new
    documents (which links to the rules too), and not a day sooner."""
    long_ago = await member(app, db, now - timedelta(days=100), NEW)
    recent = await member(app, db, now - timedelta(days=89), NEW)
    told_lately = await member(app, db, now - timedelta(days=400), NEW)
    await add(
        db, MemberNotice(user_id=told_lately.id, kind=NoticeKind.rules_reminder, created_at=now - timedelta(days=30))
    )
    told_long_ago = await member(app, db, now - timedelta(days=400), NEW)
    await add(
        db, MemberNotice(user_id=told_long_ago.id, kind=NoticeKind.rules_reminder, created_at=now - timedelta(days=95))
    )
    # Joined long ago under older documents: today's notice of new ones counts as the reminder.
    earlier = await member(app, db, now - timedelta(days=200), OLD)

    assert await run(db, settings, now) == (1, 2)
    assert [k for k, _, _ in await notices(db, long_ago)] == ["rules_reminder"]
    assert await notices(db, recent) == []
    assert [k for k, _, _ in await notices(db, told_lately)] == ["rules_reminder"]  # only the old one
    assert [k for k, _, _ in await notices(db, told_long_ago)] == ["rules_reminder", "rules_reminder"]
    assert [k for k, _, _ in await notices(db, earlier)] == ["new_documents"]

    # Day 89: the one who joined 89 days before today, and the one last reminded 30 days before
    # (due since day 60). Day 90: the three told today.
    assert await run(db, settings, now + timedelta(days=89)) == (0, 2)
    assert await run(db, settings, now + timedelta(days=90)) == (0, 3)
    assert [k for k, _, _ in await notices(db, earlier)] == ["new_documents", "rules_reminder"]


async def test_a_notice_of_new_documents_names_its_version(app: FastAPI, db: Db, now: datetime) -> None:
    """NOTICE-3: the database keeps a version on new-documents notices, and only there."""
    m = await member(app, db, now, NEW)
    for kind, version in (("new_documents", None), ("warning", NEW), ("rules_reminder", NEW)):
        async with db() as s:
            with pytest.raises(IntegrityError, match="ck_member_notices_version_documents"):
                await s.execute(
                    text("INSERT INTO member_notices (user_id, kind, version, created_at) VALUES (:u, :k, :v, now())"),
                    {"u": m.id, "k": kind, "v": version},
                )


async def test_each_run_is_audited_as_counts(app: FastAPI, db: Db, now: datetime, settings: Settings) -> None:
    """NOTICE-4: the record that members were told, with counts and no one named."""
    await member(app, db, now - timedelta(days=10), OLD)
    await member(app, db, now - timedelta(days=120), NEW)
    await run(db, settings, now)
    async with db() as s:
        entry = (await s.execute(select(AuditLog).where(AuditLog.action == "notices.documents_and_rules"))).scalar_one()
    assert (entry.actor_id, entry.target_id, entry.details) == (None, None, {"new_documents": 1, "rules_reminders": 1})
