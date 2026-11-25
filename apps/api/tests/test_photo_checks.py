"""PHOTO-CHECK-1..6 (stage 29b, D164): the blue tick, a selfie our staff compare with the photos."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.photochecks import service
from app.modules.photochecks.models import CheckState, Gesture, PhotoCheck
from app.modules.privacy import service as privacy
from app.providers.storage import photo_keys
from tests import images
from tests.chat import Db
from tests.members import Member, make_member
from tests.support import FrozenClock, JobRunner


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-26T06:00:00+00:00")
    return clock.now


async def member(app: FastAPI, db: Db, now: datetime, **kw: Any) -> Member:
    return await make_member(db, app.state.storage, now, **kw)


async def moderator(app: FastAPI, db: Db, now: datetime) -> Member:
    return await make_member(db, app.state.storage, now, role="moderator", profile=False, session_client="web_admin")


def jpeg(name: str = "selfie.jpg") -> dict[str, Any]:
    return {"file": (name, images.jpeg(), "image/jpeg")}


async def state(client: AsyncClient, who: Member) -> dict[str, Any]:
    r = await client.get("/v1/me/photo-check", headers=who.headers)
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def gesture(client: AsyncClient, who: Member) -> httpx.Response:
    return await client.post("/v1/me/photo-check/gesture", headers=who.headers)


async def send(client: AsyncClient, who: Member) -> httpx.Response:
    return await client.post("/v1/me/photo-check/selfie", files=jpeg(), headers=who.headers)


async def queue(client: AsyncClient, staff: Member) -> list[dict[str, Any]]:
    r = await client.get("/v1/admin/photo-checks/pending", headers=staff.headers)
    assert r.status_code == 200, r.text
    body: list[dict[str, Any]] = r.json()
    return body


async def decide(client: AsyncClient, staff: Member, check_id: str, **body: str) -> httpx.Response:
    return await client.post(f"/v1/admin/photo-checks/{check_id}/decision", json=body, headers=staff.headers)


async def verified(client: AsyncClient, who: Member) -> tuple[bool, bool]:
    mine = (await client.get("/v1/me/profile", headers=who.headers)).json()["photo_verified"]
    public = (await client.get(f"/v1/profiles/{who.id}", headers=who.headers)).json()["photo_verified"]
    return mine, public


async def selfie_keys(db: Db, who: Member) -> list[str]:
    async with db() as s:
        base = await s.scalar(select(PhotoCheck.storage_key).where(PhotoCheck.user_id == who.id,
                                                                   PhotoCheck.storage_key.is_not(None)))  # fmt: skip
    assert base is not None
    return list(photo_keys(base).values())


async def stored(app: FastAPI, keys: list[str]) -> list[bool]:
    return [await app.state.storage.get(k) is not None for k in keys]


async def audited(db: Db, action: str) -> int:
    async with db() as s:
        return int(await s.scalar(select(func.count()).where(AuditLog.action == action)) or 0)


def when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def test_a_selfie_our_team_approves_gives_the_blue_tick(
    app: FastAPI, client: AsyncClient, db: Db, *, now: datetime, clock: FrozenClock, jobs: JobRunner
) -> None:
    """PHOTO-CHECK-1: a gesture chosen by the server, the same one for 15 minutes; a selfie making
    it; our team sees it beside every photo and approves; the tick shows; the selfie's files go."""
    asha = await member(app, db, now, name="Asha")
    mod = await moderator(app, db, now)
    assert await state(client, asha) == {
        "state": "none", "gesture": None, "expires_at": None, "reason": None, "verified_at": None,
    }  # fmt: skip
    assert await verified(client, asha) == (False, False)

    first = await gesture(client, asha)
    assert first.status_code == 201, first.text
    given = first.json()
    assert given["state"] == "awaiting"
    assert given["gesture"] in {g.value for g in Gesture}
    assert when(given["expires_at"]) == now + timedelta(minutes=15)
    clock.advance(minutes=5)
    again = (await gesture(client, asha)).json()
    assert (again["gesture"], again["expires_at"]) == (given["gesture"], given["expires_at"])  # no re-rolling

    sent = await send(client, asha)
    assert sent.status_code == 201, sent.text
    assert sent.json()["state"] == "pending"
    assert (await state(client, asha))["state"] == "pending"
    keys = await selfie_keys(db, asha)
    assert await stored(app, keys) == [True, True]

    listed = await queue(client, mod)
    assert [c["user_id"] for c in listed] == [str(asha.id)]
    entry = listed[0]
    assert (entry["display_name"], entry["gesture"]) == ("Asha", given["gesture"])
    assert set(entry["selfie"]) == {"large", "small"}
    assert len(entry["photos"]) == 2  # every photo of hers, beside the selfie

    clock.advance(minutes=1)
    ok = await decide(client, mod, entry["id"], decision="approve")
    assert ok.status_code == 201, ok.text
    assert ok.json() == {"id": entry["id"], "state": "approved"}
    mine = await state(client, asha)
    assert (mine["state"], when(mine["verified_at"])) == ("verified", clock())
    assert await verified(client, asha) == (True, True)
    await jobs.run()
    assert await stored(app, keys) == [False, False]  # the selfie went with the decision
    assert await queue(client, mod) == []
    for action in ("photo_check.sent", "admin.photo_checks_viewed", "admin.photo_check_decided"):
        assert await audited(db, action) >= 1, action
    again = await gesture(client, asha)
    assert (again.status_code, again.json()["code"]) == (409, "already_verified")


async def test_what_comes_first(app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock) -> None:
    """PHOTO-CHECK-2: a profile and an approved photo first; a selfie only while a gesture runs; a
    new gesture once it ran out; one check at a time; a file that isn't a photo is refused."""
    nobody = await member(app, db, now, profile=False, photos=())
    r = await gesture(client, nobody)
    assert (r.status_code, r.json()["code"]) == (409, "profile_required")
    unreviewed = await member(app, db, now, photos=("pending",))
    r = await gesture(client, unreviewed)
    assert (r.status_code, r.json()["code"]) == (409, "photos_required")

    meera = await member(app, db, now)
    r = await send(client, meera)
    assert (r.status_code, r.json()["code"]) == (409, "gesture_expired")  # no gesture yet
    await gesture(client, meera)
    clock.advance(minutes=16)
    r = await send(client, meera)
    assert (r.status_code, r.json()["code"]) == (409, "gesture_expired")
    assert (await state(client, meera))["state"] == "none"
    fresh = (await gesture(client, meera)).json()
    assert fresh["state"] == "awaiting"
    assert when(fresh["expires_at"]) == clock() + timedelta(minutes=15)

    bad = await client.post(
        "/v1/me/photo-check/selfie", files={"file": ("x.jpg", b"not a photo", "image/jpeg")}, headers=meera.headers
    )
    assert bad.status_code == 422
    assert (await state(client, meera))["state"] == "awaiting"  # nothing changed
    assert (await send(client, meera)).status_code == 201
    r = await gesture(client, meera)
    assert (r.status_code, r.json()["code"]) == (409, "check_pending")
    r = await send(client, meera)
    assert (r.status_code, r.json()["code"]) == (409, "gesture_expired")


async def test_a_rejection_says_why_and_only_staff_decide(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    """PHOTO-CHECK-3: a rejection needs a reason (an approval has none); members can't decide;
    a check is decided once; the member sees why and can try again."""
    kabir = await member(app, db, now)
    mod = await moderator(app, db, now)
    await gesture(client, kabir)
    await send(client, kabir)
    check_id = (await queue(client, mod))[0]["id"]

    assert (await decide(client, mod, check_id, decision="reject")).status_code == 422
    assert (await decide(client, mod, check_id, decision="approve", reason="unclear")).status_code == 422
    assert (await decide(client, mod, check_id, decision="reject", reason="blurry")).status_code == 422
    assert (await decide(client, kabir, check_id, decision="approve")).status_code == 401  # a member's session
    assert (await decide(client, mod, str(uuid.uuid4()), decision="approve")).status_code == 404

    r = await decide(client, mod, check_id, decision="reject", reason="gesture_missing")
    assert r.json() == {"id": check_id, "state": "rejected"}
    assert await state(client, kabir) == {
        "state": "rejected", "gesture": None, "expires_at": None, "reason": "gesture_missing", "verified_at": None,
    }  # fmt: skip
    assert await verified(client, kabir) == (False, False)
    r = await decide(client, mod, check_id, decision="approve")
    assert (r.status_code, r.json()["code"]) == (409, "already_decided")

    clock.advance(minutes=1)
    assert (await gesture(client, kabir)).json()["state"] == "awaiting"


async def test_staff_never_decide_their_own(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    """PHOTO-CHECK-3b: a moderator's own check waits for someone else."""
    mod = await make_member(db, app.state.storage, now, role="moderator", session_client="web_admin")
    async with db() as s:
        check = PhotoCheck(user_id=mod.id, gesture=Gesture.thumbs_up, state=CheckState.pending,
                           storage_key="b" * 32, created_at=now, submitted_at=now)  # fmt: skip
        s.add(check)
        await s.commit()
    r = await decide(client, mod, str(check.id), decision="approve")
    assert (r.status_code, r.json()["code"]) == (409, "own_account")


async def test_a_new_photo_takes_the_tick_away(
    app: FastAPI, client: AsyncClient, db: Db, *, now: datetime, clock: FrozenClock, jobs: JobRunner
) -> None:
    """PHOTO-CHECK-4: a new photo hasn't been checked: the tick goes ("removed"), and a selfie
    still waiting is withdrawn, its files deleted."""
    riya = await member(app, db, now)
    mod = await moderator(app, db, now)
    await gesture(client, riya)
    await send(client, riya)
    await decide(client, mod, (await queue(client, mod))[0]["id"], decision="approve")
    assert await verified(client, riya) == (True, True)

    assert (await client.post("/v1/me/photos", files=jpeg("new.jpg"), headers=riya.headers)).status_code == 201
    assert (await state(client, riya))["state"] == "removed"
    assert await verified(client, riya) == (False, False)

    clock.advance(minutes=1)
    await gesture(client, riya)
    await send(client, riya)
    keys = await selfie_keys(db, riya)
    assert (await client.post("/v1/me/photos", files=jpeg("another.jpg"), headers=riya.headers)).status_code == 201
    assert (await state(client, riya))["state"] == "none"
    assert await queue(client, mod) == []
    await jobs.run()
    assert await stored(app, keys) == [False, False]
    assert await audited(db, "photo_check.cancelled") == 1


async def test_selfies_nobody_decided_go_after_14_days_and_with_the_account(
    app: FastAPI, client: AsyncClient, db: Db, *, now: datetime, clock: FrozenClock, jobs: JobRunner
) -> None:
    """PHOTO-CHECK-5: unused gestures expire after 15 minutes and undecided selfies after 14 days,
    files deleted; an account's purge deletes a selfie still waiting."""
    waiting = await member(app, db, now)
    idle = await member(app, db, now)
    await gesture(client, waiting)
    await send(client, waiting)
    await gesture(client, idle)
    keys = await selfie_keys(db, waiting)

    clock.advance(days=13)
    async with db() as s:
        assert await service.expire(s, app.state.auth.jobs, clock()) == {"gestures": 1, "selfies": 0}
    clock.advance(days=1, minutes=1)
    async with db() as s:
        assert await service.expire(s, app.state.auth.jobs, clock()) == {"gestures": 0, "selfies": 1}
    await jobs.run()
    assert await stored(app, keys) == [False, False]
    assert (await state(client, waiting))["state"] == "none"
    assert await audited(db, "photo_check.expired") == 2

    leaving = await member(app, db, clock())
    await gesture(client, leaving)
    await send(client, leaving)
    keys = await selfie_keys(db, leaving)
    async with db() as s:  # then they ask to delete the account (no sessions after that)
        await s.execute(update(User).where(User.id == leaving.id).values(deletion_requested_at=clock()))
        await s.commit()
    clock.advance(days=8)
    async with db() as s:
        assert await privacy.purge_account(s, app.state.settings, app.state.auth.jobs, leaving.id, clock()) is True
    await jobs.run()
    assert await stored(app, keys) == [False, False]


async def test_the_database_keeps_a_selfie_only_while_it_waits(db: Db, app: FastAPI, now: datetime) -> None:
    """PHOTO-CHECK-6: no selfie outside a pending check, a reason with every rejection, and one open
    check a member, whatever the code does."""
    who = await member(app, db, now)
    bad: list[tuple[dict[str, Any], str]] = [
        (dict(state=CheckState.approved, storage_key="c" * 32, submitted_at=now, decided_at=now),
         "ck_photo_checks_selfie_while_pending"),
        (dict(state=CheckState.pending, storage_key=None, submitted_at=now), "ck_photo_checks_selfie_while_pending"),
        (dict(state=CheckState.rejected, submitted_at=now, decided_at=now), "ck_photo_checks_reason_when_rejected"),
        (dict(state=CheckState.approved, submitted_at=now), "ck_photo_checks_decided"),
    ]  # fmt: skip
    for fields, constraint in bad:
        async with db() as s:
            s.add(PhotoCheck(user_id=who.id, gesture=Gesture.open_palm, created_at=now, **fields))
            with pytest.raises(IntegrityError, match=constraint):
                await s.flush()
    async with db() as s:
        s.add(PhotoCheck(user_id=who.id, gesture=Gesture.open_palm, state=CheckState.awaiting, created_at=now))
        await s.flush()
        s.add(PhotoCheck(user_id=who.id, gesture=Gesture.thumbs_up, state=CheckState.awaiting, created_at=now))
        with pytest.raises(IntegrityError, match="uq_photo_checks_open"):
            await s.flush()
