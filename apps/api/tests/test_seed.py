"""The dev seed creates labelled fixtures only, idempotently, never in production."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cli import FIXTURE_EMAIL_DOMAIN, FIXTURES, SeedRefusedError, count_fixtures, seed_dev
from app.fixtures import BIO, PROFILES
from app.modules.accounts.models import UNUSABLE_PASSWORD, User
from app.modules.audit.models import AuditLog
from app.modules.media.models import Photo
from app.modules.profiles.models import Profile
from app.providers.storage import MemoryObjectStorage
from tests.conftest import MigratedDatabase


async def test_seed_creates_only_labelled_fixtures(
    session: AsyncSession, test_db: MigratedDatabase, storage: MemoryObjectStorage
) -> None:
    total = len(FIXTURES) + len(PROFILES)
    assert await seed_dev(session, test_db.settings, storage) == total
    users = (await session.execute(select(User))).scalars().all()
    assert len(users) == total
    for user in users:
        local, domain = user.email_normalized.split("@")
        assert domain == FIXTURE_EMAIL_DOMAIN
        assert local.startswith("fixture-")
        assert user.password_hash == UNUSABLE_PASSWORD
    audit = (await session.execute(select(AuditLog).where(AuditLog.action == "dev.seed"))).scalar_one()
    assert audit.details == {"created": total, "fixtures": total}
    # Fixture profiles are labelled in their name, bio and photos.
    profiles = (await session.execute(select(Profile))).scalars().all()
    assert len(profiles) == len(PROFILES)
    assert all(p.display_name.startswith("Fixture ") and p.bio == BIO for p in profiles)
    photos = (await session.execute(select(Photo))).scalars().all()
    assert len(photos) == 2 * len(PROFILES)
    assert all(p.moderation_state == "approved" for p in photos)
    assert len(storage.objects) == 4 * len(PROFILES)


async def test_seed_is_idempotent(
    session: AsyncSession, test_db: MigratedDatabase, storage: MemoryObjectStorage
) -> None:
    await seed_dev(session, test_db.settings, storage)
    assert await seed_dev(session, test_db.settings, storage) == 0
    assert await count_fixtures(session) == len(FIXTURES) + len(PROFILES)


async def test_seed_refuses_production(
    session: AsyncSession, test_db: MigratedDatabase, storage: MemoryObjectStorage
) -> None:
    with pytest.raises(SeedRefusedError):
        await seed_dev(session, test_db.settings.model_copy(update={"app_env": "production"}), storage)
    assert await count_fixtures(session) == 0


def test_fixture_ages_are_adult() -> None:
    today = date(2026, 11, 4)
    for f in FIXTURES:
        age = today.year - f.birthdate.year - ((today.month, today.day) < (f.birthdate.month, f.birthdate.day))
        assert age >= 18, f.handle


@pytest.fixture
def storage(test_db: MigratedDatabase) -> MemoryObjectStorage:
    return MemoryObjectStorage(b"k" * 32, 300)
