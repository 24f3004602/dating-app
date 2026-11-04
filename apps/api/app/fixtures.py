"""Development fixtures for discovery: labelled, never real people.

Every fixture is named "Fixture ...", says so in its bio, uses the reserved
`fixture.invalid` domain (mail can never be delivered) and an unusable
password, and its generated photos carry the word FIXTURE. `seed-dev`
refuses to run in production.
"""

from __future__ import annotations

import io
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounts.models import UNUSABLE_PASSWORD, User, UserStatus
from app.modules.media.models import ModerationState, Photo
from app.modules.profiles.models import Gender, Intent, Profile, ProfilePrompt, Visibility
from app.providers.storage import ObjectStorage, new_photo_base, photo_keys

DOMAIN = "fixture.invalid"
BIO = "Development fixture: not a real person."


@dataclass(frozen=True)
class FixtureProfile:
    slug: str
    name: str
    gender: Gender
    interested_in: tuple[Gender, ...]
    intent: Intent
    age: int
    area_id: str
    colour: str

    @property
    def email(self) -> str:
        return f"fixture-profile-{self.slug}@{DOMAIN}"


W, M, N = Gender.woman, Gender.man, Gender.nonbinary
PROFILES: tuple[FixtureProfile, ...] = (
    FixtureProfile("aarav", "Fixture Aarav", M, (W,), Intent.long_term, 29, "delhi.saket", "#2e6f95"),
    FixtureProfile("kabir", "Fixture Kabir", M, (W,), Intent.marriage, 31, "delhi.hauz-khas", "#3d5a80"),
    FixtureProfile("rohan", "Fixture Rohan", M, (W,), Intent.long_term, 27, "gurugram.cyber-city", "#4a6c3f"),
    FixtureProfile("ishaan", "Fixture Ishaan", M, (W,), Intent.figuring_out, 25, "noida.sector-18", "#6b4f8a"),
    FixtureProfile("arjun", "Fixture Arjun", M, (W, M), Intent.long_term, 33, "delhi.dwarka", "#7a4b2f"),
    FixtureProfile("meera", "Fixture Meera", W, (M,), Intent.long_term, 28, "delhi.lajpat-nagar", "#a0446b"),
    FixtureProfile("anaya", "Fixture Anaya", W, (M,), Intent.marriage, 30, "delhi.greater-kailash", "#8a3a3a"),
    FixtureProfile("diya", "Fixture Diya", W, (M,), Intent.figuring_out, 24, "noida.sector-62", "#5b6b2a"),
    FixtureProfile("kiara", "Fixture Kiara", W, (M, W), Intent.long_term, 26, "delhi.connaught-place", "#2f6b62"),
    FixtureProfile("tara", "Fixture Tara", W, (W,), Intent.long_term, 29, "delhi.vasant-kunj", "#6a3f7a"),
    FixtureProfile("sam", "Fixture Sam", N, (W, M, N), Intent.long_term, 27, "delhi.saket", "#555b6e"),
)


def _photo(colour: str, name: str, index: int, size: tuple[int, int]) -> bytes:
    img = Image.new("RGB", size, colour)
    draw = ImageDraw.Draw(img)
    scale = max(1, size[0] // 200)
    draw.text(
        (size[0] // 10, size[1] // 3), f"FIXTURE\n{name}\nphoto {index + 1}", fill="#ffffff", font_size=18 * scale
    )
    out = io.BytesIO()
    img.save(out, "JPEG", quality=80)
    return out.getvalue()


def _born(today: date, age: int) -> date:
    d = today - timedelta(days=120)
    return d.replace(year=d.year - age)


async def seed_discovery_fixtures(session: AsyncSession, storage: ObjectStorage, now: datetime) -> int:
    created = 0
    for f in PROFILES:
        if (await session.execute(select(User.id).where(User.email_normalized == f.email))).scalar_one_or_none():
            continue
        user = User(
            email_normalized=f.email, password_hash=UNUSABLE_PASSWORD, birthdate=_born(now.date(), f.age),
            status=UserStatus.active, email_verified_at=now, last_active_at=now, created_at=now, updated_at=now,
        )  # fmt: skip
        session.add(user)
        await session.flush()
        session.add(
            Profile(
                user_id=user.id, display_name=f.name, gender=f.gender, interested_in=[g.value for g in f.interested_in],
                intent=f.intent, bio=BIO, area_id=f.area_id, area_changed_at=now - timedelta(days=2),
                visibility=Visibility.everyone, discovery_paused=False, created_at=now,
            )
        )  # fmt: skip
        await session.flush()
        session.add(ProfilePrompt(user_id=user.id, prompt_key="festival", answer="Fixture answer.", position=0))
        for i in range(2):
            base = new_photo_base()
            keys = photo_keys(base)
            await storage.put(keys["large"], _photo(f.colour, f.name, i, (1080, 1350)), "image/jpeg")
            await storage.put(keys["small"], _photo(f.colour, f.name, i, (400, 500)), "image/jpeg")
            session.add(
                Photo(user_id=user.id, position=i, storage_key=base, width=1080, height=1350,
                      sha256=secrets.token_bytes(32), moderation_state=ModerationState.approved,
                      reviewed_at=now, created_at=now)
            )  # fmt: skip
        created += 1
    return created
