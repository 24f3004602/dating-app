"""F06 moderation: staff-only routes (ADM-N1, T15), the queue and minimal
context, actions and their effects (ADM-H1), photo review (T10), and the
audit trail."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text

from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.discovery.models import Block, Match
from app.modules.media.models import ModerationState, Photo
from app.modules.safety.models import ModerationAction
from tests.chat import Db, LiveServer, closed_with, connected, history, pair, send
from tests.members import Member, make_member
from tests.support import FrozenClock

ADMIN_ROUTES = [
    ("GET", "/v1/admin/reports", None),
    ("GET", f"/v1/admin/reports/{uuid.uuid4()}", None),
    ("POST", f"/v1/admin/reports/{uuid.uuid4()}/actions", {"action": "dismiss"}),
    ("GET", "/v1/admin/photos/pending", None),
    ("POST", f"/v1/admin/photos/{uuid.uuid4()}/decision", {"decision": "approve"}),
    ("POST", f"/v1/admin/users/{uuid.uuid4()}/actions", {"action": "suspend", "note": "x"}),
    ("GET", "/v1/admin/audit-log", None),
]


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")
    return clock.now


@pytest.fixture
async def live(app: FastAPI) -> AsyncIterator[LiveServer]:
    async with LiveServer(app) as server:
        yield server


async def staff(app: FastAPI, db: Db, now: datetime, role: str = "moderator") -> Member:
    return await make_member(db, app.state.storage, now, role=role, profile=False)


async def call(client: AsyncClient, who: Member | None, method: str, url: str, body: Any = None) -> Any:
    headers = who.headers if who else {}
    return await client.request(method, url, json=body, headers=headers)


async def reported_pair(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, reason: str = "scam"
) -> tuple[Member, Member, uuid.UUID, str, dict[str, Any]]:
    """Ravi sends Asha a message and she reports it (and so blocks him)."""
    asha, ravi, match_id = await pair(app, db, now)
    msg = (await send(client, ravi, match_id, "Pay the deposit on UPI first")).json()
    r = await client.post(
        "/v1/reports",
        json={"subject_id": str(ravi.id), "reason": reason, "message_id": msg["id"], "details": "money again"},
        headers=asha.headers,
    )
    assert r.status_code == 201, r.text
    return asha, ravi, match_id, r.json()["id"], msg


# --- who may use /v1/admin (ADM-N1) -------------------------------------------------------


async def test_only_staff_reach_admin_routes_and_some_need_an_admin(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    member = await make_member(db, app.state.storage, now)
    moderator = await staff(app, db, now)
    for method, url, body in ADMIN_ROUTES:
        assert (await call(client, None, method, url, body)).status_code == 401, url
        r = await call(client, member, method, url, body)
        assert (r.status_code, r.json()["code"]) == (403, "staff_only"), url
    r = await call(client, moderator, "GET", "/v1/admin/audit-log")
    assert (r.status_code, r.json()["code"]) == (403, "admin_only")
    for action in ("ban", "reinstate"):
        r = await call(
            client, moderator, "POST", f"/v1/admin/users/{member.id}/actions", {"action": action, "note": "x"}
        )
        assert (r.status_code, r.json()["code"]) == (403, "admin_only"), action


# --- the queue and a report's context ---------------------------------------------------


async def test_the_queue_puts_underage_first_and_details_are_minimal(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    moderator = await staff(app, db, now)
    _asha, ravi, _match, scam_id, _msg = await reported_pair(app, client, db, now, "scam")
    clock.advance(minutes=1)
    meera, kabir, _ = await pair(app, db, clock())
    under = await client.post("/v1/reports", json={"subject_id": str(kabir.id), "reason": "underage"},
                              headers=meera.headers)  # fmt: skip
    queue = (await call(client, moderator, "GET", "/v1/admin/reports")).json()
    assert [q["id"] for q in queue] == [under.json()["id"], scam_id]  # underage first, though newer
    assert queue[1]["subject"]["display_name"] == "Ravi"
    assert queue[1]["about"] == "message"

    detail = await call(client, moderator, "GET", f"/v1/admin/reports/{scam_id}")
    assert detail.status_code == 200
    d = detail.json()
    assert d["status"] == "in_review"
    assert d["assignee_id"] == str(moderator.id)
    assert d["evidence_text"] == "Pay the deposit on UPI first"
    assert d["subject"]["display_name"] == "Ravi"
    assert len(d["subject"]["photos"]) == 2
    async with db() as s:
        ravi_row = await s.get(User, ravi.id)
        assert ravi_row is not None
        for private in (ravi_row.email_normalized, ravi_row.birthdate.isoformat(), "latitude", "email", "birthdate"):
            assert private not in detail.text
    mine = (await client.get("/v1/reports/mine", headers=_asha.headers)).json()
    assert mine[0]["status"] == "in_review"  # the reporter sees it is being looked at


# --- actions and their effects (ADM-H1) -----------------------------------------------


async def test_suspending_from_a_report_signs_them_out_everywhere(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, live: LiveServer
) -> None:
    moderator = await staff(app, db, now)
    asha, ravi, _match, report_id, _msg = await reported_pair(app, client, db, now)
    url = f"/v1/admin/reports/{report_id}/actions"
    async with connected(live, client, ravi) as ws:
        r = await call(client, moderator, "POST", url, {"action": "suspend", "note": "Payment scam, first offence."})
        assert r.status_code == 201, r.text
        assert r.json()["action"] == "suspend"
        assert await closed_with(ws) == 4401  # signed out at once
    assert (await client.get("/v1/me", headers=ravi.headers)).status_code == 401
    again = await call(client, moderator, "POST", url, {"action": "dismiss"})
    assert (again.status_code, again.json()["code"]) == (409, "already_resolved")
    assert (await client.get("/v1/reports/mine", headers=asha.headers)).json()[0]["status"] == "actioned"

    async with db() as s:
        user = await s.get(User, ravi.id)
        assert user is not None
        assert user.status == "suspended"
        actions = list((await s.execute(select(ModerationAction))).scalars())
        assert [(a.action, a.moderator_id, a.target_user_id) for a in actions] == [("suspend", moderator.id, ravi.id)]
        audited = set((await s.execute(select(AuditLog.action).where(AuditLog.actor_id == moderator.id))).scalars())
        assert {"admin.report_actioned"} <= audited
        # Append-only: the app's role cannot change or delete the record.
        with pytest.raises(Exception, match="permission denied"):
            await s.execute(text("UPDATE moderation_actions SET note = 'changed'"))


async def test_removing_a_message_and_a_photo(app: FastAPI, client: AsyncClient, db: Db, now: datetime) -> None:
    moderator = await staff(app, db, now)
    asha, ravi, match_id, report_id, _msg = await reported_pair(app, client, db, now)
    r = await call(client, moderator, "POST", f"/v1/admin/reports/{report_id}/actions", {"action": "remove_message"})
    assert r.status_code == 201
    async with db() as s:  # for the check, reopen the conversation that the report's block closed
        await s.execute(text("DELETE FROM blocks"))
        await s.execute(text("UPDATE matches SET closed_at = NULL, closed_reason = NULL"))
        await s.commit()
    for who in (asha, ravi):
        (item,) = (await history(client, who, match_id)).json()["items"]
        assert (item["removed"], item["body"], item["safety_tip"]) == (True, "", None)
        assert (await client.get("/v1/matches", headers=who.headers)).json()[0]["last_message"]["preview"] == ""

    photo_report = await client.post(
        "/v1/reports",
        json={"subject_id": str(ravi.id), "reason": "explicit", "photo_id": str(ravi.photo_ids[0]), "block": False},
        headers=asha.headers,
    )
    pid = photo_report.json()["id"]
    profile_only = await client.post(
        "/v1/reports", json={"subject_id": str(ravi.id), "reason": "fake", "block": False}, headers=asha.headers
    )
    nothing = await call(client, moderator, "POST", f"/v1/admin/reports/{profile_only.json()['id']}/actions",
                         {"action": "remove_photo"})  # fmt: skip
    assert (nothing.status_code, nothing.json()["code"]) == (409, "nothing_to_remove")
    assert (
        await call(client, moderator, "POST", f"/v1/admin/reports/{pid}/actions", {"action": "remove_photo"})
    ).status_code == 201
    async with db() as s:
        photo = await s.get(Photo, ravi.photo_ids[0])
        assert photo is not None
        assert photo.moderation_state is ModerationState.rejected
    assert (await client.get(f"/v1/media/{ravi.photo_ids[0]}", headers=asha.headers)).status_code == 404


async def test_staff_limits_own_account_and_staff_accounts(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    moderator = await staff(app, db, now)
    admin = await staff(app, db, now, "admin")
    other_mod = await staff(app, db, now)
    member = await make_member(db, app.state.storage, now)
    url = "/v1/admin/users/{}/actions"
    own = await call(client, moderator, "POST", url.format(moderator.id), {"action": "suspend", "note": "x"})
    assert (own.status_code, own.json()["code"]) == (409, "own_account")
    peer = await call(client, moderator, "POST", url.format(other_mod.id), {"action": "suspend", "note": "x"})
    assert (peer.status_code, peer.json()["code"]) == (403, "admin_only")
    missing = await call(client, admin, "POST", url.format(uuid.uuid4()), {"action": "suspend", "note": "x"})
    assert (missing.status_code, missing.json()["code"]) == (409, "account_gone")
    no_note = await call(client, moderator, "POST", url.format(member.id), {"action": "suspend"})
    assert no_note.status_code == 422  # account actions need a reason

    # A report about a moderator: not theirs to handle, and only an admin may.
    asha, _ravi, _ = await pair(app, db, now)
    async with db() as s:  # Asha blocked the moderator: a connection she can report on
        s.add(Block(blocker_id=asha.id, blocked_id=moderator.id, created_at=now))
        await s.commit()
    about_mod = await client.post("/v1/reports", json={"subject_id": str(moderator.id), "reason": "harassment"},
                                  headers=asha.headers)  # fmt: skip
    rid = about_mod.json()["id"]
    assert (await call(client, moderator, "GET", f"/v1/admin/reports/{rid}")).json()["code"] == "own_account"
    assert (await call(client, other_mod, "GET", f"/v1/admin/reports/{rid}")).json()["code"] == "admin_only"
    assert (await call(client, admin, "GET", f"/v1/admin/reports/{rid}")).status_code == 200


async def test_banning_closes_matches_and_reinstating_is_for_admins(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    admin = await staff(app, db, now, "admin")
    asha, ravi, match_id = await pair(app, db, now)
    url = f"/v1/admin/users/{ravi.id}/actions"
    assert (await call(client, admin, "POST", url, {"action": "ban", "note": "Repeated scams."})).status_code == 201
    async with db() as s:
        match = await s.get(Match, match_id)
        user = await s.get(User, ravi.id)
        assert match is not None
        assert user is not None
        assert (match.closed_reason, user.status) == ("moderation", "banned")
    assert (await client.get("/v1/me", headers=ravi.headers)).status_code == 401
    assert (
        await call(client, admin, "POST", url, {"action": "reinstate", "note": "Appeal upheld."})
    ).status_code == 201
    again = await call(client, admin, "POST", url, {"action": "reinstate", "note": "twice"})
    assert (again.status_code, again.json()["code"]) == (409, "not_restricted")
    async with db() as s:
        user = await s.get(User, ravi.id)
        assert user is not None
        assert user.status == "active"
    assert (await client.get(f"/v1/matches/{match_id}", headers=asha.headers)).status_code == 404  # stays ended

    log = (await call(client, admin, "GET", "/v1/admin/audit-log")).json()
    actions = [e for e in log if e["action"] == "admin.account_action"]
    assert sorted(e["details"]["action"] for e in actions) == ["ban", "reinstate"]
    assert all(set(e["details"]) <= {"action", "count", "reason"} for e in log)  # codes only, no personal data


# --- photo review (T10) ------------------------------------------------------------------


async def test_photo_review_approves_and_rejects(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, clock: FrozenClock
) -> None:
    moderator = await staff(app, db, now)
    new = await make_member(db, app.state.storage, now, photos=("pending", "pending"))
    clock.advance(minutes=5)
    later = await make_member(db, app.state.storage, clock(), photos=("pending",))
    pending = (await call(client, moderator, "GET", "/v1/admin/photos/pending")).json()
    ids = [p["photo"]["id"] for p in pending]
    assert set(ids[:2]) == {str(i) for i in new.photo_ids}  # oldest first (same upload time: either order)
    assert ids[2:] == [str(later.photo_ids[0])]
    assert pending[0]["photo"]["urls"]["small"].startswith("/v1/media/blob/")

    me_before = (await client.get("/v1/me/profile", headers=new.headers)).json()
    assert me_before["readiness"]["ready"] is False
    for pid in new.photo_ids:
        r = await call(client, moderator, "POST", f"/v1/admin/photos/{pid}/decision", {"decision": "approve"})
        assert (r.status_code, r.json()["action"]) == (201, "approve_photo")
    assert (await client.get("/v1/me/profile", headers=new.headers)).json()["readiness"]["ready"] is True
    r = await call(client, moderator, "POST", f"/v1/admin/photos/{later.photo_ids[0]}/decision",
                   {"decision": "reject", "note": "Not a photo of a person."})  # fmt: skip
    assert r.status_code == 201
    assert (await call(client, moderator, "GET", "/v1/admin/photos/pending")).json() == []
    assert (await call(client, moderator, "POST", f"/v1/admin/photos/{uuid.uuid4()}/decision",
                       {"decision": "approve"})).status_code == 404  # fmt: skip

    selfie = await make_member(db, app.state.storage, now, role="moderator", photos=("pending",))
    own = await call(
        client, selfie, "POST", f"/v1/admin/photos/{selfie.photo_ids[0]}/decision", {"decision": "approve"}
    )
    assert (own.status_code, own.json()["code"]) == (409, "own_account")
