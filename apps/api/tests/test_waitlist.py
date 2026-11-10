"""WL-1..14 (stage 20c, D101): the waitlist's double opt-in, privacy and limits."""

from __future__ import annotations

import hashlib
import re
import uuid

from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.privacy.service import sweep
from app.modules.waitlist import service
from app.modules.waitlist.models import WaitlistEntry
from tests.support import FrozenClock, JobRunner

Db = async_sessionmaker[AsyncSession]
LINK = re.compile(r"/waitlist/(confirm|leave)\?t=([A-Za-z0-9_.\-]+)")


def form(app: FastAPI, email: str, **change: object) -> dict[str, object]:
    return {"email": email, "adult": True, "privacy": app.state.settings.privacy_version, **change}


async def entries(db: Db) -> list[WaitlistEntry]:
    async with db() as s:
        return list((await s.execute(select(WaitlistEntry).order_by(WaitlistEntry.created_at))).scalars().all())


def links(jobs: JobRunner, email: str) -> dict[str, str]:
    [message] = jobs.mail_to(email)[-1:]
    return {kind: token for kind, token in LINK.findall(message.text)}


async def test_joining_sends_one_confirmation_link_and_stores_no_token(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner
) -> None:
    r = await client.post("/v1/waitlist", json=form(app, " Asha@Example.com "))
    assert r.status_code == 202, r.text
    assert r.json() == {"status": "accepted"}
    pending = await jobs.pending()
    assert [(name, args) for _, name, args in pending] == [
        (service.SEND_CONFIRMATION, {"entry_id": str((await entries(db))[0].id)})
    ]  # the job holds only the entry's ID
    await jobs.run()
    [entry] = await entries(db)
    assert entry.email_normalized == "asha@example.com"
    assert entry.confirmed_at is None
    assert entry.privacy_version == app.state.settings.privacy_version
    [message] = jobs.mail_to("asha@example.com")
    assert message.subject == f"Confirm your place on the {app.state.settings.brand_name} waitlist"
    found = links(jobs, "asha@example.com")
    assert set(found) == {"confirm", "leave"}
    assert message.text.count(app.state.settings.site_url + "/waitlist/") == 2
    token = jobs.waitlist_tokens[-1]
    assert found["confirm"] == token
    assert entry.confirm_token_hash == hashlib.sha256(token.encode()).digest()  # only the digest is kept


async def test_the_link_confirms_once(app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner) -> None:
    await client.post("/v1/waitlist", json=form(app, "ravi@example.com"))
    await jobs.run()
    token = jobs.waitlist_tokens[-1]
    r = await client.post("/v1/waitlist/confirm", json={"token": token})
    assert r.status_code == 204, r.text
    [entry] = await entries(db)
    assert entry.confirmed_at is not None
    assert entry.confirm_token_hash is None
    assert entry.confirm_expires_at is None
    again = await client.post("/v1/waitlist/confirm", json={"token": token})
    assert again.status_code == 400
    assert again.json()["code"] == "invalid_link"


async def test_an_expired_or_unknown_link_does_nothing(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    await client.post("/v1/waitlist", json=form(app, "late@example.com"))
    await jobs.run()
    clock.advance(days=7, seconds=1)
    r = await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[-1]})
    assert r.status_code == 400
    r = await client.post("/v1/waitlist/confirm", json={"token": "x" * 43})
    assert r.status_code == 400
    assert (await entries(db))[0].confirmed_at is None


async def test_the_answer_is_the_same_for_new_waiting_and_confirmed_addresses(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    first = await client.post("/v1/waitlist", json=form(app, "meera@example.com"))
    await jobs.run()
    await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[-1]})
    clock.advance(hours=1)
    repeat = await client.post("/v1/waitlist", json=form(app, "meera@example.com"))
    assert (repeat.status_code, repeat.json()) == (first.status_code, first.json())
    assert await jobs.pending() == []  # a confirmed address gets nothing more
    assert len(jobs.mail_to("meera@example.com")) == 1
    assert len(await entries(db)) == 1


async def test_a_repeat_join_resends_the_link_at_most_every_five_minutes(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    await client.post("/v1/waitlist", json=form(app, "dev@example.com"))
    await jobs.run()
    first = jobs.waitlist_tokens[-1]
    clock.advance(minutes=4)
    await client.post("/v1/waitlist", json=form(app, "dev@example.com"))
    assert await jobs.pending() == []
    clock.advance(minutes=1)
    await client.post("/v1/waitlist", json=form(app, "dev@example.com"))
    await jobs.run()
    assert len(jobs.mail_to("dev@example.com")) == 2
    assert (await client.post("/v1/waitlist/confirm", json={"token": first})).status_code == 400  # replaced
    assert (await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[-1]})).status_code == 204


async def test_adults_only_and_the_current_notice_checked_before_anything_is_stored(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner
) -> None:
    r = await client.post("/v1/waitlist", json=form(app, "kid@example.com", adult=False))
    assert (r.status_code, r.json()["code"]) == (422, "underage")
    r = await client.post("/v1/waitlist", json=form(app, "old@example.com", privacy="draft-2020-01"))
    assert (r.status_code, r.json()["code"]) == (422, "consent_required")
    assert r.json()["required"] == {"privacy": app.state.settings.privacy_version}
    r = await client.post("/v1/waitlist", json={"email": "x@example.com", "privacy": "v"})
    assert r.status_code == 422  # the 18+ answer is required
    r = await client.post("/v1/waitlist", json={**form(app, "x@example.com"), "name": "extra"})
    assert r.status_code == 422  # unknown fields are refused
    assert await entries(db) == []
    assert await jobs.pending() == []


async def test_leaving_deletes_the_address(app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner) -> None:
    await client.post("/v1/waitlist", json=form(app, "bye@example.com"))
    await client.post("/v1/waitlist", json=form(app, "stay@example.com"))
    await jobs.run()
    leave = links(jobs, "bye@example.com")["leave"]
    r = await client.post("/v1/waitlist/leave", json={"token": leave})
    assert r.status_code == 204
    assert [e.email_normalized for e in await entries(db)] == ["stay@example.com"]
    assert (await client.post("/v1/waitlist/leave", json={"token": leave})).status_code == 204  # idempotent


async def test_a_forged_leave_link_deletes_nothing_and_answers_the_same(
    app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner
) -> None:
    await client.post("/v1/waitlist", json=form(app, "safe@example.com"))
    await jobs.run()
    [entry] = await entries(db)
    other_key = app.state.settings.model_copy(update={"app_secret_key": SecretStr("y" * 32)})
    for token in (
        service.leave_token(other_key, entry.id),  # signed with another key
        f"{entry.id.hex}.{'A' * 43}",  # a made-up signature
        service.leave_token(app.state.settings, uuid.uuid4()).replace(".", "-"),  # malformed
    ):
        r = await client.post("/v1/waitlist/leave", json={"token": token})
        assert r.status_code == 204
    assert len(await entries(db)) == 1


async def test_joins_are_limited_per_address_whether_or_not_it_is_listed(app: FastAPI, client: AsyncClient) -> None:
    for _ in range(service.JOIN_EMAIL.limit):
        assert (await client.post("/v1/waitlist", json=form(app, "spam@example.com"))).status_code == 202
    r = await client.post("/v1/waitlist", json=form(app, "spam@example.com"))
    assert r.status_code == 429
    assert "retry-after" in r.headers


async def test_joins_are_limited_per_ip(app: FastAPI, client: AsyncClient) -> None:
    for n in range(service.JOIN_IP.limit):
        assert (await client.post("/v1/waitlist", json=form(app, f"p{n}@example.com"))).status_code == 202
    assert (await client.post("/v1/waitlist", json=form(app, "one-more@example.com"))).status_code == 429


async def test_the_sweep_keeps_the_waitlist_to_its_retention_rules(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    settings = app.state.settings
    await client.post("/v1/waitlist", json=form(app, "unconfirmed@example.com"))
    await client.post("/v1/waitlist", json=form(app, "confirmed@example.com"))
    await jobs.run()
    await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[-1]})
    clock.advance(days=7, seconds=1)  # the unconfirmed link has expired
    async with db() as s:
        counts = await sweep(s, settings, clock())
    assert counts["waitlist_entries"] == 1
    assert [e.email_normalized for e in await entries(db)] == ["confirmed@example.com"]

    async with db() as s:  # the opening email went out: kept 30 more days
        entry = (await s.execute(select(WaitlistEntry))).scalar_one()
        entry.notified_at = clock()
        await s.commit()
    clock.advance(days=30)
    async with db() as s:
        assert (await sweep(s, settings, clock()))["waitlist_entries"] == 0
    clock.advance(seconds=1)
    async with db() as s:
        assert (await sweep(s, settings, clock()))["waitlist_entries"] == 1
    assert await entries(db) == []


async def test_no_entry_outlives_a_year(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    await client.post("/v1/waitlist", json=form(app, "patient@example.com"))
    await jobs.run()
    await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[-1]})
    clock.advance(days=364)
    async with db() as s:
        assert (await sweep(s, app.state.settings, clock()))["waitlist_entries"] == 0
    clock.advance(days=1, seconds=1)
    async with db() as s:
        assert (await sweep(s, app.state.settings, clock()))["waitlist_entries"] == 1


async def test_an_entry_whose_email_never_went_out_goes_after_seven_days(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db
) -> None:
    await client.post("/v1/waitlist", json=form(app, "queued@example.com"))  # the job hasn't run
    clock.advance(days=7)
    async with db() as s:
        assert (await sweep(s, app.state.settings, clock()))["waitlist_entries"] == 0
    clock.advance(seconds=1)
    async with db() as s:
        assert (await sweep(s, app.state.settings, clock()))["waitlist_entries"] == 1


async def test_the_counts_never_include_addresses(app: FastAPI, client: AsyncClient, db: Db, jobs: JobRunner) -> None:
    await client.post("/v1/waitlist", json=form(app, "a@example.com"))
    await client.post("/v1/waitlist", json=form(app, "b@example.com"))
    await jobs.run()
    await client.post("/v1/waitlist/confirm", json={"token": jobs.waitlist_tokens[0]})
    async with db() as s:
        assert await service.counts(s) == (1, 1)
    async with db() as s:
        total = (await s.execute(select(func.count()).select_from(WaitlistEntry))).scalar_one()
    assert total == 2
