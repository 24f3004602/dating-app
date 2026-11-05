"""INV-1..7 (stage 18, D096): invite-only sign-up for the closed beta."""

from __future__ import annotations

import dataclasses

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.cli import main as cli
from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.auth import service
from app.modules.auth.models import SignupInvite
from app.modules.auth.schemas import normalize_email
from app.modules.privacy.service import sweep
from tests.support import PASSWORD, FrozenClock, JobRunner, register

Db = async_sessionmaker[AsyncSession]


@pytest.fixture
def invite_only(app: FastAPI) -> FastAPI:
    settings = app.state.settings.model_copy(update={"signup_invite_only": True})
    app.state.auth = dataclasses.replace(app.state.auth, settings=settings)
    return app


async def invite(db: Db, app: FastAPI, clock: FrozenClock, *emails: str) -> int:
    async with db() as s:
        return await service.add_invites(s, app.state.auth.settings, [normalize_email(e) for e in emails], clock())


async def count(db: Db, model: type, *where: object) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())  # type: ignore[arg-type]


async def test_someone_not_invited_gets_the_usual_answer_and_nothing_is_kept(
    invite_only: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    r = await register(client, jobs.settings, clock, "stranger@example.com")
    assert r.status_code == 202  # the same as an invited sign-up: the list isn't revealed
    assert await count(db, User) == 0
    assert await jobs.pending() == []  # no code, no email
    assert await count(db, AuditLog, AuditLog.action == "auth.register_not_invited", AuditLog.target_id.is_(None)) == 1


async def test_an_invited_tester_signs_up_and_the_invite_is_used_up(
    invite_only: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    assert await invite(db, invite_only, clock, " Tester@Example.com ") == 1  # normalised like the API
    r = await register(client, jobs.settings, clock, "tester@example.com")
    assert r.status_code == 202
    await jobs.run()
    r = await client.post(
        "/v1/auth/verify-email", json={"email": "tester@example.com", "code": jobs.last_code, "password": PASSWORD}
    )
    assert r.status_code == 201, r.text
    assert await count(db, SignupInvite) == 0  # the account exists; the invite has done its job
    async with db() as s:
        stored = (await s.execute(select(SignupInvite.email_digest))).all()
    assert stored == []


async def test_an_expired_invite_no_longer_works_and_a_renewal_does(
    invite_only: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    await invite(db, invite_only, clock, "late@example.com")
    clock.advance(days=invite_only.state.auth.settings.invite_days, seconds=1)
    await register(client, jobs.settings, clock, "late@example.com")
    assert await count(db, User) == 0
    await invite(db, invite_only, clock, "late@example.com")  # re-invited: a fresh expiry
    await register(client, jobs.settings, clock, "late@example.com")
    assert await count(db, User) == 1


async def test_the_list_holds_only_keyed_hashes(invite_only: FastAPI, clock: FrozenClock, db: Db) -> None:
    await invite(db, invite_only, clock, "private@example.com")
    async with db() as s:
        [digest] = (await s.execute(select(SignupInvite.email_digest))).scalars().all()
    assert b"private" not in digest
    assert len(digest) == 32
    assert digest == service.invite_digest(invite_only.state.auth.settings, "private@example.com")
    other_key = invite_only.state.auth.settings.model_copy(update={"app_secret_key": SecretStr("y" * 32)})
    assert digest != service.invite_digest(other_key, "private@example.com")


async def test_remove_count_and_the_sweep(invite_only: FastAPI, clock: FrozenClock, db: Db) -> None:
    settings = invite_only.state.auth.settings
    await invite(db, invite_only, clock, "a@example.com", "b@example.com", "c@example.com")
    async with db() as s:
        assert await service.remove_invites(s, settings, ["c@example.com", "nobody@example.com"]) == 1
        assert await service.live_invites(s, clock()) == 2
    clock.advance(days=settings.invite_days + 1)
    async with db() as s:
        assert await service.live_invites(s, clock()) == 0
        counts = await sweep(s, settings, clock())
    assert counts["signup_invites"] == 2
    assert await count(db, SignupInvite) == 0


async def test_without_invite_only_anyone_can_sign_up(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    assert not app.state.auth.settings.signup_invite_only  # development and production default
    assert (await register(client, jobs.settings, clock, "open@example.com")).status_code == 202
    assert await count(db, User) == 1


def test_the_command_refuses_a_bad_email(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli(["invite", "add", "not-an-email"]) == 2
    assert "not a valid email address" in capsys.readouterr().err
    assert cli(["invite", "add"]) == 2
