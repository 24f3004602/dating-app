"""The two-hour path, part 1 (stage 28e, D157; IT Rules rule 3(2)(b)): a report of sexual content
or impersonation holds the photo it names at once, and urgent reports reach the operator by email
without naming anyone. URGENT-1..6 in replica/test-plan.md."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.modules.audit.models import AuditLog
from app.modules.media.models import ModerationState, Photo
from app.modules.safety.service import ALERT_URGENT
from tests.chat import Db, pair
from tests.members import Member, make_member
from tests.support import FrozenClock, JobRunner

ALERTS = "moderation@example.test"


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-25T08:30:00+00:00")  # 14:00 in India
    return clock.now


@pytest.fixture
def alerts(jobs: JobRunner) -> JobRunner:
    """The job runner with MODERATION_ALERT_EMAIL set, as on a server."""
    jobs.settings = jobs.settings.model_copy(update={"moderation_alert_email": ALERTS})
    return jobs


async def staff(app: FastAPI, db: Db, now: datetime) -> Member:
    return await make_member(db, app.state.storage, now, role="moderator", profile=False, session_client="web_admin")


async def report(client: AsyncClient, who: Member, subject: Member, reason: str, **extra: Any) -> dict[str, Any]:
    body = {"subject_id": str(subject.id), "reason": reason, "block": False, **extra}
    r = await client.post("/v1/reports", json=body, headers=who.headers)
    assert r.status_code == 201, r.text
    return dict(r.json())


async def photo(db: Db, photo_id: uuid.UUID) -> Photo:
    async with db() as s:
        row = await s.get(Photo, photo_id)
        assert row is not None
        return row


async def alert_jobs(jobs: JobRunner) -> int:
    return sum(1 for _, name, _ in await jobs.pending() if name == ALERT_URGENT)


async def sees(client: AsyncClient, who: Member, photo_id: uuid.UUID) -> bool:
    r = await client.get(f"/v1/media/{photo_id}", headers=who.headers)
    assert r.status_code in (302, 404), r.text
    return r.status_code == 302


async def test_a_sexual_photo_report_holds_the_photo_at_once_and_alerts(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, alerts: JobRunner
) -> None:
    """URGENT-1: held (pending, only its owner sees it), first in the photo queue, and one alert
    that names no one."""
    asha, ravi, _ = await pair(app, db, now)
    target = ravi.photo_ids[0]
    assert await sees(client, asha, target)
    # A new photo that was waiting longer than the held one: the held one still comes first.
    await make_member(db, app.state.storage, now - timedelta(days=1), name="Older", photos=("pending",))

    out = await report(client, asha, ravi, "explicit", photo_id=str(target))
    held = await photo(db, target)
    assert (held.moderation_state, held.held_at) == (ModerationState.pending, now)
    assert not await sees(client, asha, target)  # the reporter, still matched, no longer gets it
    assert await sees(client, ravi, target)  # its owner does, in review
    assert await sees(client, asha, ravi.photo_ids[1])  # only the reported photo is held
    async with db() as s:
        entry = (await s.execute(select(AuditLog).where(AuditLog.action == "photo.held"))).scalar_one()
        assert (entry.actor_id, entry.target_id, entry.details) == (None, target, {"report": out["id"]})

    # One alert, to the operator: counts, a time and the console, never a name or an address.
    assert await alert_jobs(alerts) == 1
    assert await alerts.run() == 1
    [mail] = alerts.mail_to(ALERTS)
    assert mail.subject == f"[{alerts.settings.brand_name}] 1 urgent report to review"
    assert "- 1 sexual or explicit content" in mail.text
    assert "The oldest arrived at 14:00 (India time), 0 minutes ago." in mail.text
    assert f"{alerts.settings.site_url}/admin" in mail.text
    for private in ("Asha", "Ravi", "@", str(target), out["id"]):
        assert private not in mail.text.replace(alerts.settings.site_url, ""), private

    mod = await staff(app, db, now)
    queue = (await client.get("/v1/admin/photos/pending", headers=mod.headers)).json()
    assert (queue[0]["photo"]["id"], queue[0]["held"]) == (str(target), True)
    assert [q["held"] for q in queue[1:]] == [False]
    detail = (await client.get(f"/v1/admin/reports/{out['id']}", headers=mod.headers)).json()
    assert detail["photo_held"] is True


async def test_which_reports_hold_a_photo_and_which_alert(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, jobs: JobRunner
) -> None:
    """URGENT-2: sexual content and impersonation hold a named, approved photo; a possible minor
    alerts without one; harassment does neither; a photo still waiting for review is never held."""
    asha, ravi, _ = await pair(app, db, now)
    await report(client, asha, ravi, "harassment", photo_id=str(ravi.photo_ids[0]))
    assert (await photo(db, ravi.photo_ids[0])).held_at is None
    assert await alert_jobs(jobs) == 0

    await report(client, asha, ravi, "fake", photo_id=str(ravi.photo_ids[1]))
    impersonating = await photo(db, ravi.photo_ids[1])
    assert (impersonating.moderation_state, impersonating.held_at) == (ModerationState.pending, now)
    assert await alert_jobs(jobs) == 1

    await jobs.run()
    await report(client, asha, ravi, "underage")
    assert await alert_jobs(jobs) == 1  # the profile isn't hidden: a person decides that

    new = await make_member(db, app.state.storage, now, name="New", photos=("pending",))
    async with db() as s:
        await s.execute(text("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (:a, :b, :t)"),
                        {"a": asha.id, "b": new.id, "t": now})  # fmt: skip
        await s.commit()
    await report(client, asha, new, "explicit", photo_id=str(new.photo_ids[0]))
    waiting = await photo(db, new.photo_ids[0])
    assert (waiting.moderation_state, waiting.held_at) == (ModerationState.pending, None)


async def test_a_burst_of_urgent_reports_sends_one_alert_for_those_nobody_opened(
    app: FastAPI, client: AsyncClient, db: Db, *, now: datetime, clock: FrozenClock, alerts: JobRunner
) -> None:
    """URGENT-3: one alert waits at a time (its queueing lock refuses a second inside a savepoint,
    and the report is still made); it counts what is unopened when it runs; opened ones don't count."""
    asha, ravi, _ = await pair(app, db, now)
    first = await report(client, asha, ravi, "explicit", photo_id=str(ravi.photo_ids[0]))
    clock.advance(minutes=3)
    await report(client, asha, ravi, "fake")
    assert await alert_jobs(alerts) == 1
    clock.advance(minutes=2)
    await alerts.run()
    [mail] = alerts.mail_to(ALERTS)
    assert mail.subject.endswith("2 urgent reports to review")
    assert "- 1 fake profile or pretending to be someone else" in mail.text
    assert "The oldest arrived at 14:00 (India time), 5 minutes ago." in mail.text

    # A moderator opens the first; a new alert counts only the one nobody has opened.
    mod = await staff(app, db, now)
    assert (await client.get(f"/v1/admin/reports/{first['id']}", headers=mod.headers)).status_code == 200
    await report(client, asha, ravi, "underage")
    await alerts.run()
    assert alerts.mail_to(ALERTS)[-1].subject.endswith("2 urgent reports to review")  # the fake one and this
    # Everything opened before the alert runs: it sends nothing.
    await report(client, asha, ravi, "explicit")
    async with db() as s:
        await s.execute(text("UPDATE reports SET status = 'in_review', assignee_id = :m"), {"m": mod.id})
        await s.commit()
    sent = len(alerts.mail_to(ALERTS))
    assert await alerts.run() == 1
    assert len(alerts.mail_to(ALERTS)) == sent


async def test_deciding_ends_a_hold(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """URGENT-4: dismissing gives the photo back unless another open report of the kind holds it;
    removing rejects it; any other action leaves it held for the photo queue, where a decision ends it."""
    asha, ravi, _ = await pair(app, db, now)
    mod = await staff(app, db, now)

    async def act(report_id: str, action: str) -> None:
        r = await client.post(f"/v1/admin/reports/{report_id}/actions", json={"action": action}, headers=mod.headers)
        assert r.status_code == 201, r.text

    # Two reports hold the same photo: the first dismissal keeps it held, the second gives it back.
    one = await report(client, asha, ravi, "explicit", photo_id=str(ravi.photo_ids[0]))
    two = await report(client, asha, ravi, "fake", photo_id=str(ravi.photo_ids[0]))
    await act(one["id"], "dismiss")
    assert (await photo(db, ravi.photo_ids[0])).held_at == now
    await act(two["id"], "dismiss")
    back = await photo(db, ravi.photo_ids[0])
    assert (back.moderation_state, back.held_at, back.reviewed_at) == (ModerationState.approved, None, now)
    assert await sees(client, asha, ravi.photo_ids[0])
    async with db() as s:
        released = (await s.execute(select(AuditLog).where(AuditLog.action == "photo.released"))).scalar_one()
        assert (released.actor_id, released.details) == (mod.id, {"report": two["id"]})

    # Removing it rejects it for good.
    three = await report(client, asha, ravi, "explicit", photo_id=str(ravi.photo_ids[0]))
    await act(three["id"], "remove_photo")
    gone = await photo(db, ravi.photo_ids[0])
    assert (gone.moderation_state, gone.held_at) == (ModerationState.rejected, None)

    # A warning leaves the photo held; the photo queue's decision ends the hold.
    four = await report(client, asha, ravi, "fake", photo_id=str(ravi.photo_ids[1]))
    await act(four["id"], "warn")
    assert (await photo(db, ravi.photo_ids[1])).held_at == now
    r = await client.post(
        f"/v1/admin/photos/{ravi.photo_ids[1]}/decision", json={"decision": "approve"}, headers=mod.headers
    )
    assert r.status_code == 201, r.text
    decided = await photo(db, ravi.photo_ids[1])
    assert (decided.moderation_state, decided.held_at) == (ModerationState.approved, None)

    # Dismissing a report about a photo nobody held changes nothing.
    five = await report(client, asha, ravi, "harassment", photo_id=str(ravi.photo_ids[1]))
    await act(five["id"], "dismiss")
    assert (await photo(db, ravi.photo_ids[1])).moderation_state is ModerationState.approved


async def test_no_alert_address_sends_nothing(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, jobs: JobRunner
) -> None:
    """URGENT-5: development has no MODERATION_ALERT_EMAIL (a server must, test_app_config)."""
    asha, ravi, _ = await pair(app, db, now)
    await report(client, asha, ravi, "underage")
    assert jobs.settings.moderation_alert_email is None
    assert await jobs.run() == 1
    assert jobs.mail.outbox == []


async def test_a_held_photo_is_always_pending(app: FastAPI, db: Db, now: datetime) -> None:
    """URGENT-6: the database refuses a hold on a photo members can see (ck_photos_held_pending)."""
    member = await make_member(db, app.state.storage, now)
    async with db() as s:
        with pytest.raises(IntegrityError, match="ck_photos_held_pending"):
            await s.execute(text("UPDATE photos SET held_at = now() WHERE id = :id"), {"id": member.photo_ids[0]})
