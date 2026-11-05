"""Build members straight in the database (fast, and every attribute under
control), each with a real session token for the API."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.accounts.models import User, UserRole, UserStatus
from app.modules.auth.crypto import new_session_token
from app.modules.auth.models import Session, SessionClient
from app.modules.discovery.models import Preferences
from app.modules.media.models import ModerationState, Photo
from app.modules.profiles.models import Gender, Intent, Profile, ProfilePrompt, Visibility
from app.providers.storage import MemoryObjectStorage, new_photo_base, photo_keys


@dataclass(frozen=True)
class Member:
    id: uuid.UUID
    token: str
    photo_ids: list[uuid.UUID]

    @property
    def headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self.token}"}


def born(today: date, age: int) -> date:
    """A birthdate making someone `age` today (birthday ~100 days ago)."""
    d = today - timedelta(days=100)
    return d.replace(year=d.year - age)


async def make_member(
    db: async_sessionmaker[AsyncSession],
    storage: MemoryObjectStorage,
    now: datetime,
    *,
    gender: str = "man",
    interested_in: tuple[str, ...] = ("woman",),
    intent: str = "long_term",
    age: int = 28,
    area_id: str = "delhi.saket",
    prefs: tuple[int, int, int | None] | None = None,
    visibility: str = "everyone",
    paused: bool = False,
    photos: tuple[str, ...] = ("approved", "approved"),
    status: str = "active",
    deletion_requested: bool = False,
    prompts: tuple[str, ...] = (),
    bio: str | None = None,
    last_active: timedelta | None = timedelta(hours=1),
    profile: bool = True,
    name: str = "Member",
    role: str = "member",
    session_client: str = "mobile",
) -> Member:
    """`session_client="web_admin"` gives the token a staff session, as if after
    two-factor sign-in (which test_staff covers end to end)."""
    today = now.date()
    async with db() as s:
        user = User(
            email_normalized=f"m-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="!",
            birthdate=born(today, age),
            status=UserStatus(status),
            role=UserRole(role),
            email_verified_at=now,
            last_active_at=now - last_active if last_active is not None else None,
            deletion_requested_at=now if deletion_requested else None,
            created_at=now,
            updated_at=now,
        )
        s.add(user)
        await s.flush()
        token, digest = new_session_token()
        staff = session_client == "web_admin"
        life = timedelta(hours=12) if staff else timedelta(days=30)
        s.add(Session(user_id=user.id, token_hash=digest, client=SessionClient(session_client), created_at=now,
                      expires_at=now + life, last_used_at=now))  # fmt: skip
        photo_ids: list[uuid.UUID] = []
        if profile:
            s.add(
                Profile(
                    user_id=user.id, display_name=name, gender=Gender(gender), interested_in=list(interested_in),
                    intent=Intent(intent), bio=bio, area_id=area_id, area_changed_at=now - timedelta(days=2),
                    visibility=Visibility(visibility), discovery_paused=paused, created_at=now,
                )
            )  # fmt: skip
            await s.flush()
            for position, key in enumerate(prompts):
                s.add(ProfilePrompt(user_id=user.id, prompt_key=key, answer="An answer.", position=position))
            for position, state in enumerate(photos):
                base = new_photo_base()
                for key in photo_keys(base).values():
                    await storage.put(key, b"\xff\xd8 test jpeg bytes", "image/jpeg")
                photo = Photo(
                    user_id=user.id,
                    position=position,
                    storage_key=base,
                    width=1080,
                    height=720,
                    sha256=secrets.token_bytes(32),
                    moderation_state=ModerationState(state),
                    created_at=now,
                )
                s.add(photo)
                await s.flush()
                photo_ids.append(photo.id)
        if prefs is not None:
            s.add(Preferences(user_id=user.id, age_min=prefs[0], age_max=prefs[1], max_distance_km=prefs[2]))
        await s.commit()
        return Member(id=user.id, token=token, photo_ids=photo_ids)


async def add(db: async_sessionmaker[AsyncSession], *rows: Any) -> None:
    async with db() as s:
        s.add_all(rows)
        await s.commit()
