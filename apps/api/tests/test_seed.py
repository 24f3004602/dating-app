"""The dev seed creates labelled fixtures only, idempotently, never in production."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cli import FIXTURE_EMAIL_DOMAIN, FIXTURES, SeedRefusedError, count_fixtures, seed_dev
from app.modules.accounts.models import UNUSABLE_PASSWORD, User
from app.modules.audit.models import AuditLog
from tests.conftest import MigratedDatabase


async def test_seed_creates_only_labelled_fixtures(session: AsyncSession, test_db: MigratedDatabase) -> None:
    assert await seed_dev(session, test_db.settings) == len(FIXTURES)
    users = (await session.execute(select(User))).scalars().all()
    assert len(users) == len(FIXTURES)
    for user in users:
        local, domain = user.email_normalized.split("@")
        assert domain == FIXTURE_EMAIL_DOMAIN
        assert local.startswith("fixture-")
        assert user.password_hash == UNUSABLE_PASSWORD
    audit = (await session.execute(select(AuditLog).where(AuditLog.action == "dev.seed"))).scalar_one()
    assert audit.details == {"created": len(FIXTURES), "fixtures": len(FIXTURES)}


async def test_seed_is_idempotent(session: AsyncSession, test_db: MigratedDatabase) -> None:
    await seed_dev(session, test_db.settings)
    assert await seed_dev(session, test_db.settings) == 0
    assert await count_fixtures(session) == len(FIXTURES)


async def test_seed_refuses_production(session: AsyncSession, test_db: MigratedDatabase) -> None:
    with pytest.raises(SeedRefusedError):
        await seed_dev(session, test_db.settings.model_copy(update={"app_env": "production"}))
    assert await count_fixtures(session) == 0


def test_fixture_ages_are_adult() -> None:
    today = date(2026, 11, 4)
    for f in FIXTURES:
        age = today.year - f.birthdate.year - ((today.month, today.day) < (f.birthdate.month, f.birthdate.day))
        assert age >= 18, f.handle
