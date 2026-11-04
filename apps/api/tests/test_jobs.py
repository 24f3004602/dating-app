"""Jobs: transactional deferral, and the real worker end to end."""

from __future__ import annotations

import asyncio
import re
import uuid
from collections.abc import AsyncIterator, Iterator

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clock import system_clock
from app.config import Settings
from app.jobs import WorkerContext, get_job_app, open_worker_pool, set_worker_context
from app.main import create_app
from app.modules.accounts.models import User
from app.modules.auth import service
from app.modules.auth.models import CodePurpose
from app.providers.email import MemoryEmailSender
from tests.conftest import alembic_config, close_app, drop_database, recreate_database, with_database
from tests.support import PASSWORD, FrozenClock, JobRunner, register

Db = async_sessionmaker[AsyncSession]


async def test_deferral_commits_and_rolls_back_with_the_transaction(app: FastAPI, db: Db, jobs: JobRunner) -> None:
    queue = app.state.auth.jobs
    async with db() as s:
        await queue.defer(s, service.ISSUE_CODE, user_id=str(uuid.uuid4()), purpose="verify_email")
        await s.rollback()
    assert await jobs.pending() == []
    async with db() as s:
        await queue.defer(s, service.ISSUE_CODE, user_id=str(uuid.uuid4()), purpose="verify_email")
        await s.commit()
    assert len(await jobs.pending()) == 1


async def test_issue_code_ignores_missing_or_ineligible_users(app: FastAPI, db: Db, clock: FrozenClock) -> None:
    mail = MemoryEmailSender()
    async with db() as s:
        code = await service.issue_code(
            s, app.state.settings, mail, now=clock(), user_id=uuid.uuid4(), purpose=CodePurpose.verify_email
        )
    assert code is None
    assert mail.outbox == []


# --- the real worker, against a committed scratch database ---------------------------


@pytest.fixture
def scratch_settings(base_settings: Settings) -> Iterator[Settings]:
    assert base_settings.migrations_database_url is not None
    owner = base_settings.migrations_database_url.get_secret_value()
    name = "datingapp_jobs_test"
    recreate_database(owner, name)
    command.upgrade(alembic_config(with_database(owner, name), base_settings.db_runtime_role), "head")
    yield base_settings.model_copy(
        update={
            "app_env": "test",
            "database_url": SecretStr(with_database(base_settings.database_url.get_secret_value(), name)),
            "migrations_database_url": SecretStr(with_database(owner, name)),
            "password_hash_profile": "test",
            "email_backend": "memory",
            "rate_limit_prefix": f"rl-test-{uuid.uuid4().hex[:12]}",
        }
    )
    drop_database(owner, name)


@pytest.fixture
async def committed_app(scratch_settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(scratch_settings, configure_logs=False)  # real sessions: every commit is real
    yield application
    keys = [k async for k in application.state.redis.scan_iter(match=f"{scratch_settings.rate_limit_prefix}:*")]
    if keys:
        await application.state.redis.delete(*keys)
    await close_app(application)


async def test_worker_end_to_end_with_concurrent_verification(
    committed_app: FastAPI, scratch_settings: Settings
) -> None:
    mail = MemoryEmailSender()
    set_worker_context(
        WorkerContext(
            scratch_settings, committed_app.state.session_factory, mail, system_clock, committed_app.state.storage
        )
    )
    job_app = get_job_app()
    pool = await open_worker_pool(scratch_settings)
    email = "worker.e2e@example.com"
    try:
        async with AsyncClient(transport=ASGITransport(app=committed_app), base_url="http://testserver") as c:
            assert (await register(c, scratch_settings, FrozenClock(), email)).status_code == 202

            async with job_app.open_async(pool=pool):
                await job_app.run_worker_async(
                    wait=False, install_signal_handlers=False, listen_notify=False, delete_jobs="successful"
                )

            (message,) = mail.outbox
            assert message.to == email
            match = re.search(r"\b(\d{6})\b", message.text)
            assert match is not None
            body = {"email": email, "code": match.group(1), "password": PASSWORD}

            # Two devices submit the same code at once: exactly one session.
            results = await asyncio.gather(*(c.post("/v1/auth/verify-email", json=body) for _ in range(2)))
            assert sorted(r.status_code for r in results) == [201, 400]
    finally:
        set_worker_context(None)
        await pool.close()

    async with committed_app.state.session_factory() as s:
        jobs_left = (await s.execute(text("SELECT count(*) FROM procrastinate_jobs"))).scalar_one()
        active = (await s.execute(select(func.count()).select_from(User).where(User.status == "active"))).scalar_one()
    assert jobs_left == 0  # finished jobs are deleted
    assert active == 1


def test_one_job_app_per_process_keeps_task_names_stable() -> None:
    """Regression: a second procrastinate App renamed tasks to `auth:auth:...`."""
    first, second = get_job_app(), get_job_app()
    assert first is second
    names = {name for name in first.tasks if name.startswith("auth:")}
    assert names == {service.ISSUE_CODE, service.SEND_NOTICE}
