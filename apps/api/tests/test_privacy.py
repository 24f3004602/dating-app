"""F09 privacy: account deletion (request, grace period, restore, purge with its
listed exceptions) and the retention sweep (D083-D085)."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, or_, select, text, update

from app.modules.accounts.models import Consent, ConsentKind, User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth.models import CodePurpose, OneTimeCode, Session, SessionClient
from app.modules.auth.service import local_today
from app.modules.discovery.models import Block, DailyPick, Interaction, InteractionKind, Match, Preferences
from app.modules.media.models import Photo
from app.modules.messaging.models import MatchRead, Message
from app.modules.privacy import retention, service
from app.modules.privacy.models import DeletedAccount
from app.modules.profiles.models import Profile, ProfilePrompt
from app.modules.safety.models import ActionKind, ModerationAction, Report, ReportReason, ReportStatus
from app.providers.storage import photo_keys
from tests.chat import Db, LiveServer, closed_with, connected, event, match_between, pair, send
from tests.members import Member, add, make_member
from tests.support import PASSWORD, FrozenClock, JobRunner, register, signup


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:00+00:00")
    return clock.now


@pytest.fixture
async def live(app: FastAPI) -> AsyncIterator[LiveServer]:
    async with LiveServer(app) as server:
        yield server


async def deletable(app: FastAPI, db: Db, who: Member) -> Member:
    """Give a fixture member a real password and the consents sign-up records."""
    settings = app.state.settings
    async with db() as s:
        await s.execute(
            update(User).where(User.id == who.id).values(password_hash=app.state.auth.passwords.hash(PASSWORD))
        )
        s.add(Consent(user_id=who.id, kind=ConsentKind.terms, version=settings.terms_version))
        s.add(Consent(user_id=who.id, kind=ConsentKind.privacy, version=settings.privacy_version))
        await s.commit()
    return who


async def email_of(db: Db, who: Member) -> str:
    async with db() as s:
        return str((await s.execute(select(User.email_normalized).where(User.id == who.id))).scalar_one())


def delete_me(client: AsyncClient, who: Member | dict[str, str], password: str = PASSWORD) -> Any:
    headers = who.headers if isinstance(who, Member) else who
    return client.post("/v1/me/deletion", json={"password": password}, headers=headers)


async def count(db: Db, model: type, *where: Any) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())


async def purge(app: FastAPI, db: Db, clock: FrozenClock) -> int:
    return await service.purge_due_accounts(db, app.state.settings, app.state.auth.jobs, clock())


async def audited(db: Db, action: str, target: uuid.UUID | None = None) -> list[AuditLog]:
    async with db() as s:
        stmt = select(AuditLog).where(AuditLog.action == action)
        if target is not None:
            stmt = stmt.where(AuditLog.target_id == target)
        return list((await s.execute(stmt)).scalars())


# --- the request ----------------------------------------------------------------------


async def test_deleting_needs_the_password_and_is_limited(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime
) -> None:
    asha = await deletable(app, db, await make_member(db, app.state.storage, now))
    assert (await client.post("/v1/me/deletion", json={"password": PASSWORD})).status_code == 401
    assert (await client.post("/v1/me/deletion", json={}, headers=asha.headers)).status_code == 422
    for _ in range(5):
        r = await delete_me(client, asha, "not my password at all")
        assert (r.status_code, r.json()["code"]) == (403, "password_incorrect")
    assert (await delete_me(client, asha)).status_code == 429  # 5 tries an hour, right or wrong
    assert (await client.get("/v1/me", headers=asha.headers)).status_code == 200  # nothing changed
    assert len(await audited(db, "account.deletion_password_failed", asha.id)) == 5
    async with db() as s:
        user = await s.get(User, asha.id)
        assert user is not None
        assert (user.status, user.deletion_requested_at) == (UserStatus.active, None)


async def test_a_request_hides_the_account_signs_it_out_and_ends_its_matches_live(
    app: FastAPI, client: AsyncClient, db: Db, now: datetime, live: LiveServer
) -> None:
    asha, ravi, match_id = await pair(app, db, now)
    await deletable(app, db, asha)
    kiran = await make_member(db, app.state.storage, now, name="Kiran")
    day = local_today(app.state.settings, now)
    await add(
        db,
        DailyPick(viewer_id=ravi.id, pick_date=day, candidate_id=asha.id, rank=1, distance_bucket="under_5_km"),
        DailyPick(viewer_id=asha.id, pick_date=day, candidate_id=kiran.id, rank=1, distance_bucket="under_5_km"),
        Interaction(actor_id=asha.id, target_id=kiran.id, kind=InteractionKind.like, created_at=now),
    )
    assert len((await client.get("/v1/likes/received", headers=kiran.headers)).json()) == 1
    assert (await send(client, ravi, match_id, "Hi Asha")).status_code == 201

    async with connected(live, client, asha) as asha_ws, connected(live, client, ravi) as ravi_ws:
        r = await delete_me(client, asha)
        assert r.status_code == 202, r.text
        assert datetime.fromisoformat(r.json()["purge_after"]) == now + timedelta(days=7)
        assert await closed_with(asha_ws) == 4401  # signed out everywhere, live
        assert await event(ravi_ws) == {"type": "match.closed", "match_id": str(match_id)}

    assert (await client.get("/v1/me", headers=asha.headers)).status_code == 401
    assert (await client.get("/v1/matches", headers=ravi.headers)).json() == []
    for path in (f"/v1/matches/{match_id}", f"/v1/profiles/{asha.id}", f"/v1/media/{asha.photo_ids[0]}"):
        assert (await client.get(path, headers=ravi.headers)).status_code == 404, path
    assert (await send(client, ravi, match_id, "Still there?")).status_code == 404
    assert (await client.get("/v1/likes/received", headers=kiran.headers)).json() == []
    assert await count(db, DailyPick, or_(DailyPick.candidate_id == asha.id, DailyPick.viewer_id == asha.id)) == 0
    assert await count(db, Session, Session.user_id == asha.id, Session.revoked_at.is_(None)) == 0
    async with db() as s:
        user = await s.get(User, asha.id)
        match = await s.get(Match, match_id)
        assert user is not None
        assert match is not None
        assert (user.status, user.deletion_requested_at) == (UserStatus.deactivated, now)
        assert match.closed_reason == "deleted"
    assert len(await audited(db, "account.deletion_requested", asha.id)) == 1


async def test_signing_in_during_the_grace_period_can_keep_the_account(
    app: FastAPI, client: AsyncClient, db: Db, *, jobs: JobRunner, clock: FrozenClock, now: datetime
) -> None:
    email = "keep.me@example.com"
    session = await signup(client, jobs, email)
    headers = {"authorization": f"Bearer {session['token']}"}
    assert (await delete_me(client, headers)).status_code == 202
    clock.advance(days=3)
    login = {"email": email, "password": PASSWORD}

    r = await client.post("/v1/auth/login", json=login)
    assert (r.status_code, r.json()["code"]) == (403, "deletion_scheduled")
    assert datetime.fromisoformat(r.json()["purge_after"]) == now + timedelta(days=7)
    wrong = {"email": email, "password": "not the right password"}
    for path in ("/v1/auth/login", "/v1/auth/restore"):
        r = await client.post(path, json=wrong)
        assert (r.status_code, r.json()["code"]) == (401, "invalid_credentials"), path  # nothing told without it

    r = await client.post("/v1/auth/restore", json=login)
    assert r.status_code == 200, r.text
    me = await client.get("/v1/me", headers={"authorization": f"Bearer {r.json()['token']}"})
    assert (me.status_code, me.json()["status"]) == (200, "active")
    assert (await client.get("/v1/me", headers=headers)).status_code == 401  # the old session stays ended
    assert len(await audited(db, "account.restored")) == 1
    assert (await client.post("/v1/auth/restore", json=login)).status_code == 200  # a retry just signs in


async def test_a_password_reset_still_works_while_waiting(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner, now: datetime
) -> None:
    email = "forgot.it@example.com"
    session = await signup(client, jobs, email)
    assert (await delete_me(client, {"authorization": f"Bearer {session['token']}"})).status_code == 202
    assert (await client.post("/v1/auth/password-reset/request", json={"email": email})).status_code == 202
    await jobs.run()
    new_password = "amber orchard pebble forty"
    body = {"email": email, "code": jobs.last_code, "new_password": new_password}
    assert (await client.post("/v1/auth/password-reset/confirm", json=body)).status_code == 204
    r = await client.post("/v1/auth/login", json={"email": email, "password": new_password})
    assert (r.status_code, r.json()["code"]) == (403, "deletion_scheduled")
    assert (await client.post("/v1/auth/restore", json={"email": email, "password": new_password})).status_code == 200


# --- the purge ------------------------------------------------------------------------


async def test_the_purge_deletes_everything_except_the_listed_exceptions(
    app: FastAPI, client: AsyncClient, db: Db, *, jobs: JobRunner, clock: FrozenClock, now: datetime
) -> None:
    storage = app.state.storage
    asha, ravi, match_id = await pair(app, db, now)
    await deletable(app, db, asha)
    kiran = await make_member(db, storage, now, name="Kiran")
    await add(
        db,
        ProfilePrompt(user_id=asha.id, prompt_key="weekend_plan", answer="Chai and books.", position=0),
        Preferences(user_id=asha.id, age_min=25, age_max=35, max_distance_km=None),
        DailyPick(viewer_id=asha.id, pick_date=local_today(app.state.settings, now), candidate_id=kiran.id, rank=1,
                  distance_bucket="under_5_km"),
        Interaction(actor_id=asha.id, target_id=kiran.id, kind=InteractionKind.like, created_at=now),
        Interaction(actor_id=kiran.id, target_id=asha.id, kind=InteractionKind.passed, created_at=now),
        Block(blocker_id=asha.id, blocked_id=kiran.id, created_at=now),
        Block(blocker_id=kiran.id, blocked_id=asha.id, created_at=now),
        ModerationAction(moderator_id=uuid.uuid4(), target_user_id=asha.id, action=ActionKind.warn, created_at=now),
    )  # fmt: skip
    assert (await send(client, asha, match_id, "Send me money on UPI")).status_code == 201
    assert (await send(client, ravi, match_id, "No thanks")).status_code == 201
    assert (await client.post(f"/v1/matches/{match_id}/read", json={"up_to_n": 2}, headers=asha.headers)).is_success
    async with db() as s:
        money = (await s.execute(select(Message.id).where(Message.match_id == match_id, Message.n == 1))).scalar_one()
    by_ravi = await client.post(
        "/v1/reports",
        json={"subject_id": str(asha.id), "reason": "scam", "message_id": str(money), "block": False},
        headers=ravi.headers,
    )
    by_asha = await client.post(
        "/v1/reports", json={"subject_id": str(kiran.id), "reason": "fake", "block": False}, headers=asha.headers
    )
    assert (by_ravi.status_code, by_asha.status_code) == (201, 201)
    async with db() as s:  # resolved, so it doesn't hold the purge
        await s.execute(
            update(Report).where(Report.subject_id == asha.id).values(status=ReportStatus.dismissed, resolved_at=now)
        )
        await s.commit()
    asha_keys = [k for p in await _photos(db, asha) for k in photo_keys(p).values()]
    ravi_keys = [k for p in await _photos(db, ravi) for k in photo_keys(p).values()]
    assert (await delete_me(client, asha)).status_code == 202

    clock.advance(days=7, seconds=-60)
    assert await purge(app, db, clock) == 0  # still in the grace period
    clock.advance(seconds=120)
    assert await purge(app, db, clock) == 1

    gone = {
        User: [User.id == asha.id],
        Session: [Session.user_id == asha.id],
        OneTimeCode: [OneTimeCode.user_id == asha.id],
        Consent: [Consent.user_id == asha.id],
        Profile: [Profile.user_id == asha.id],
        ProfilePrompt: [ProfilePrompt.user_id == asha.id],
        Photo: [Photo.user_id == asha.id],
        Preferences: [Preferences.user_id == asha.id],
        DailyPick: [or_(DailyPick.viewer_id == asha.id, DailyPick.candidate_id == asha.id)],
        Interaction: [or_(Interaction.actor_id == asha.id, Interaction.target_id == asha.id)],
        Match: [Match.id == match_id],
        Message: [Message.match_id == match_id],  # both people's messages: the conversation is gone
        MatchRead: [MatchRead.match_id == match_id],
        Block: [or_(Block.blocker_id == asha.id, Block.blocked_id == asha.id)],
    }
    for model, where in gone.items():
        assert await count(db, model, *where) == 0, model.__name__
    assert await count(db, Photo, Photo.user_id == ravi.id) == 2  # nobody else's data

    # Photo files: queued in the purge transaction, deleted by the worker.
    assert all(k in storage.objects for k in asha_keys)
    await jobs.run()
    assert not any(k in storage.objects for k in asha_keys)
    assert all(k in storage.objects for k in ravi_keys)

    # The exceptions: reports with their copy, moderation records and the audit trail (IDs only).
    async with db() as s:
        about_her = (await s.execute(select(Report).where(Report.reporter_id == ravi.id))).scalar_one()
        assert (about_her.subject_id, about_her.message_id) == (None, None)
        assert about_her.evidence_text == "Send me money on UPI"
        hers = (await s.execute(select(Report).where(Report.subject_id == kiran.id))).scalar_one()
        assert hers.reporter_id is None
        assert (await s.execute(select(ModerationAction.target_user_id))).scalar_one() == asha.id
        record = await s.get(DeletedAccount, asha.id)
        assert record is not None
        assert (record.requested_at, record.deleted_at, record.was_banned) == (now, clock(), False)
        assert record.email_digest is None
        assert sorted(c["kind"] for c in record.consents) == ["privacy", "terms"]
        assert record.keep_until == clock() + timedelta(days=365)
    (purged,) = await audited(db, "account.purged", asha.id)
    assert purged.actor_id is None
    assert purged.details == {"reason": "requested", "photos": 2}


async def _photos(db: Db, who: Member) -> list[str]:
    async with db() as s:
        return list((await s.execute(select(Photo.storage_key).where(Photo.user_id == who.id))).scalars())


async def test_an_open_report_about_the_account_holds_the_purge_for_at_most_30_days(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    asha, ravi, _ = await pair(app, db, now)
    meera = await make_member(db, app.state.storage, now, gender="woman", interested_in=("man",), name="Meera")
    await match_between(db, meera, ravi, now)
    for who in (asha, meera):
        await deletable(app, db, who)
        r = await client.post(
            "/v1/reports", json={"subject_id": str(who.id), "reason": "harassment", "block": False},
            headers=ravi.headers,
        )  # fmt: skip
        assert r.status_code == 201
        assert (await delete_me(client, who)).status_code == 202

    clock.advance(days=8)
    assert await purge(app, db, clock) == 0  # both held by their open reports
    async with db() as s:
        await s.execute(
            update(Report).where(Report.subject_id == asha.id).values(status=ReportStatus.actioned, resolved_at=clock())
        )
        await s.commit()
    assert await purge(app, db, clock) == 1  # resolved: Asha goes
    assert await count(db, User, User.id == asha.id) == 0

    clock.advance(days=28)  # day 36: Meera's report is still open
    assert await purge(app, db, clock) == 0
    clock.advance(days=1, minutes=1)  # just past 7 + 30 days: the hold runs out
    assert await purge(app, db, clock) == 1
    async with db() as s:
        report = (await s.execute(select(Report).where(Report.reason == ReportReason.harassment,
                                                       Report.status == ReportStatus.open))).scalar_one()  # fmt: skip
        assert report.subject_id is None  # still in the queue, without the person


async def test_a_restore_that_commits_first_wins_over_the_purge(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    asha = await deletable(app, db, await make_member(db, app.state.storage, now))
    assert (await delete_me(client, asha)).status_code == 202
    clock.advance(days=8)
    async with db() as s:
        assert await service.due_accounts(s, clock()) == [asha.id]
    login = {"email": await email_of(db, asha), "password": PASSWORD}
    assert (await client.post("/v1/auth/restore", json=login)).status_code == 200
    async with db() as s:  # the purge re-checks under the row lock
        assert await service.purge_account(s, app.state.settings, app.state.auth.jobs, asha.id, clock()) is False
    assert await count(db, User, User.id == asha.id, User.status == UserStatus.active) == 1


async def test_banned_accounts_are_purged_after_90_days_and_the_email_waits_a_year(
    app: FastAPI, client: AsyncClient, db: Db, *, jobs: JobRunner, clock: FrozenClock, now: datetime
) -> None:
    admin = await make_member(db, app.state.storage, now, role="admin", name="Admin", session_client="web_admin")
    asha, ravi, _ = await pair(app, db, now)
    email = await email_of(db, asha)

    async def act(who: Member, action: str, by: Member = admin) -> None:
        r = await client.post(
            f"/v1/admin/users/{who.id}/actions", json={"action": action, "note": "test"}, headers=by.headers
        )
        assert r.status_code == 201, r.text

    await act(asha, "ban")
    await act(ravi, "ban")
    clock.advance(days=10)
    # Staff sessions last 12 hours: an admin signed in today does the reinstating.
    today = await make_member(db, app.state.storage, clock(), role="admin", name="Admin", session_client="web_admin")
    await act(ravi, "reinstate", today)  # reinstated: never purged for the ban
    clock.advance(days=80, seconds=-60)
    assert await purge(app, db, clock) == 0
    clock.advance(seconds=120)
    assert await purge(app, db, clock) == 1
    assert await count(db, User, User.id == ravi.id) == 1
    await jobs.run()  # her photo files
    async with db() as s:
        record = await s.get(DeletedAccount, asha.id)
        assert record is not None
        assert (record.was_banned, record.requested_at) == (True, None)
        assert record.email_digest is not None
        assert len(record.email_digest) == 32
        assert email.encode() not in record.email_digest

    # The same email can't sign up again for a year; the answer is the usual one.
    r = await register(client, app.state.settings, clock, email)
    assert r.status_code == 202
    assert await count(db, User, User.email_normalized == email) == 0
    assert await jobs.pending() == []  # no code is sent
    assert len(await audited(db, "auth.register_barred")) == 1

    clock.advance(days=366)
    async with db() as s:
        assert (await service.sweep(s, app.state.settings, clock()))["deleted_account_records"] == 1
    assert (await register(client, app.state.settings, clock, email)).status_code == 202
    assert [name for _, name, _ in await jobs.pending()] == ["auth:issue_code"]


async def test_reinstating_an_account_waiting_for_deletion_keeps_it_waiting(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    admin = await make_member(db, app.state.storage, now, role="admin", name="Admin", session_client="web_admin")
    asha = await deletable(app, db, await make_member(db, app.state.storage, now))
    assert (await delete_me(client, asha)).status_code == 202
    for action in ("ban", "reinstate"):
        r = await client.post(
            f"/v1/admin/users/{asha.id}/actions", json={"action": action, "note": "test"}, headers=admin.headers
        )
        assert r.status_code == 201, r.text
    async with db() as s:
        user = await s.get(User, asha.id)
        assert user is not None
        assert user.status is UserStatus.deactivated
    clock.advance(days=8)
    assert await purge(app, db, clock) == 1
    async with db() as s:
        record = await s.get(DeletedAccount, asha.id)
        assert record is not None
        assert (record.was_banned, record.email_digest) == (False, None)


# --- the retention sweep -------------------------------------------------------------


async def test_the_retention_sweep_applies_each_rule_at_its_boundary(
    app: FastAPI, db: Db, clock: FrozenClock, now: datetime
) -> None:
    storage = app.state.storage
    people = [await make_member(db, storage, now, name=f"P{i}") for i in range(6)]
    p0, p1, p2, p3, p4, p5 = people
    old = await match_between(db, p0, p1, now - timedelta(days=60))
    recent = await match_between(db, p2, p3, now - timedelta(days=60))
    still_open = await match_between(db, p4, p5, now - timedelta(days=100))
    msg_id = uuid.uuid4()
    async with db() as s:
        await s.execute(update(Match).where(Match.id == old).values(closed_at=now - timedelta(days=31),
                                                                   closed_reason="unmatched"))  # fmt: skip
        await s.execute(update(Match).where(Match.id == recent).values(closed_at=now - timedelta(days=29),
                                                                      closed_reason="blocked"))  # fmt: skip
        for match_id, sender in ((old, p0), (recent, p2), (still_open, p4)):
            s.add(Message(id=msg_id if match_id == old else uuid.uuid4(), match_id=match_id, sender_id=sender.id,
                          n=1, body="hello", client_message_id=uuid.uuid4(),
                          created_at=now - timedelta(days=40)))  # fmt: skip
            s.add(MatchRead(match_id=match_id, user_id=sender.id, last_read_n=1))
        await s.commit()

    today = local_today(app.state.settings, now)

    def ago(**kw: float) -> datetime:
        return now - timedelta(**kw)

    reports = {
        "unlink": Report(reporter_id=p1.id, subject_id=p0.id, reason=ReportReason.scam, priority=2,
                         status=ReportStatus.dismissed, resolved_at=ago(days=91), message_id=msg_id,
                         evidence_text="hello", created_at=ago(days=95)),
        "keep_link": Report(reporter_id=p1.id, subject_id=p2.id, reason=ReportReason.fake, priority=3,
                            status=ReportStatus.actioned, resolved_at=ago(days=89), created_at=ago(days=95)),
        "delete": Report(reporter_id=p1.id, subject_id=p3.id, reason=ReportReason.fake, priority=3,
                         status=ReportStatus.dismissed, resolved_at=ago(days=731), created_at=ago(days=740)),
        "open": Report(reporter_id=p1.id, subject_id=p4.id, reason=ReportReason.hate, priority=2,
                       status=ReportStatus.open, created_at=ago(days=800)),
    }  # fmt: skip
    born = ago(days=10000).date()
    pending_old = User(email_normalized="never.verified@example.com", password_hash="!", birthdate=born,
                       status=UserStatus.pending, created_at=ago(days=8), updated_at=ago(days=8))  # fmt: skip
    pending_new = User(email_normalized="verifying.now@example.com", password_hash="!", birthdate=born,
                       status=UserStatus.pending, created_at=ago(days=6), updated_at=ago(days=6))  # fmt: skip

    def pick(days: int, who: Member) -> DailyPick:
        return DailyPick(viewer_id=p0.id, pick_date=today - timedelta(days=days), candidate_id=who.id, rank=1,
                         distance_bucket="under_5_km")  # fmt: skip

    def sess(created: datetime, expires: datetime, revoked: datetime | None = None) -> Session:
        return Session(user_id=p5.id, token_hash=secrets.token_bytes(32), client=SessionClient.mobile,
                       created_at=created, expires_at=expires, revoked_at=revoked)  # fmt: skip

    await add(
        db, *reports.values(), pending_old, pending_new,
        pick(8, p1), pick(6, p2), pick(0, p3),
        sess(ago(days=70), ago(days=31)),  # expired 31 days ago: gone
        sess(ago(days=70), ago(days=29)),  # expired 29 days ago: kept
        sess(ago(days=40), now + timedelta(days=1), ago(days=31)),  # revoked 31 days ago: gone
        sess(ago(days=40), now + timedelta(days=1), ago(days=29)),  # revoked 29 days ago: kept
        OneTimeCode(user_id=p5.id, purpose=CodePurpose.verify_email, code_hash=secrets.token_bytes(32),
                    created_at=ago(hours=26), expires_at=ago(hours=25), consumed_at=ago(hours=25, minutes=5)),
        OneTimeCode(user_id=p5.id, purpose=CodePurpose.reset_password, code_hash=secrets.token_bytes(32),
                    created_at=ago(hours=24), expires_at=ago(hours=23)),
        DeletedAccount(user_id=uuid.uuid4(), deleted_at=ago(days=400), was_banned=False, keep_until=ago(days=35)),
        DeletedAccount(user_id=uuid.uuid4(), deleted_at=ago(days=300), was_banned=False,
                       keep_until=now + timedelta(days=65)),
    )  # fmt: skip
    await add(db, Consent(user_id=pending_old.id, kind=ConsentKind.terms, version="draft-2026-11"))
    async with db() as s:
        # Three years, by the database's own clock (the function runs as the schema owner).
        await s.execute(text(
            "INSERT INTO audit_log (action, created_at) VALUES ('test.expired', now() - interval '3 years 1 day'),"
            " ('test.kept', now() - interval '3 years' + interval '1 day')"
        ))  # fmt: skip
        await s.execute(text(
            "INSERT INTO moderation_actions (moderator_id, action, created_at) VALUES"
            " (gen_random_uuid(), 'warn', now() - interval '3 years 1 day'),"
            " (gen_random_uuid(), 'dismiss', now() - interval '3 years' + interval '1 day')"
        ))  # fmt: skip
        await s.commit()

    async with db() as s:
        counts = await service.sweep(s, app.state.settings, clock())
    assert counts == {
        "closed_matches": 1, "daily_picks": 1, "sessions": 2, "codes": 1, "unverified_accounts": 1,
        "reporter_links": 1, "reports": 1, "deleted_account_records": 1, "audit_records": 2, "staff_enrollments": 0,
    }  # fmt: skip

    assert await count(db, Match, Match.id == old) == 0
    assert await count(db, Message, Message.match_id == old) == 0
    assert await count(db, MatchRead, MatchRead.match_id == old) == 0
    for kept in (recent, still_open):
        assert await count(db, Message, Message.match_id == kept) == 1
    async with db() as s:
        unlinked = await s.get(Report, reports["unlink"].id)
        assert unlinked is not None
        assert (unlinked.reporter_id, unlinked.message_id, unlinked.evidence_text) == (None, None, "hello")
        kept_link = await s.get(Report, reports["keep_link"].id)
        assert kept_link is not None
        assert kept_link.reporter_id == p1.id
        assert await s.get(Report, reports["delete"].id) is None
        assert await s.get(Report, reports["open"].id) is not None
        actions = set((await s.execute(text("SELECT action FROM audit_log WHERE action LIKE 'test.%'"))).scalars())
        assert actions == {"test.kept"}
        assert (await s.execute(text("SELECT action FROM moderation_actions"))).scalars().all() == ["dismiss"]
    assert await count(db, User, User.id == pending_old.id) == 0
    assert await count(db, Consent, Consent.user_id == pending_old.id) == 0
    assert await count(db, User, User.id == pending_new.id) == 1
    assert await count(db, DailyPick, DailyPick.viewer_id == p0.id) == 2
    assert await count(db, OneTimeCode, OneTimeCode.user_id == p5.id) == 1
    assert len(await audited(db, "account.expired_unverified", pending_old.id)) == 1
    (swept,) = await audited(db, "retention.swept")
    assert swept.details == counts

    async with db() as s:  # nothing left to do: no audit noise
        assert not any((await service.sweep(s, app.state.settings, clock())).values())
    assert len(await audited(db, "retention.swept")) == 1


def test_the_privacy_jobs_are_scheduled() -> None:
    from app.jobs import get_job_app  # noqa: PLC0415

    registry = get_job_app().periodic_registry.periodic_tasks
    assert {task.task.name: task.cron for task in registry.values()} == {
        "privacy:purge_accounts": "7 * * * *",
        "privacy:retention_sweep": "37 * * * *",
        "privacy:remove_old_jobs": "15 21 * * *",
    }
    assert timedelta(days=7) == retention.ACCOUNT_GRACE
