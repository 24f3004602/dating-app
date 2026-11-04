"""Profiles: create or edit, privacy settings, and the own/public views."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.auth.service import age_on, local_today
from app.modules.media.models import ModerationState
from app.modules.media.service import MIN_APPROVED_FOR_DISCOVERY, list_photos, photo_out
from app.modules.profiles.catalogue import PROMPTS
from app.modules.profiles.models import Area, Profile, ProfilePrompt
from app.modules.profiles.schemas import (
    AreaOut,
    MyProfileOut,
    PrivacyIn,
    ProfileIn,
    PromptAnswerOut,
    PublicProfileOut,
    Readiness,
)
from app.providers.storage import ObjectStorage

AREA_CHANGE_INTERVAL = timedelta(hours=24)


async def get_profile(session: AsyncSession, user_id: uuid.UUID, *, lock: bool = False) -> Profile | None:
    stmt = select(Profile).where(Profile.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_areas(session: AsyncSession) -> list[Area]:
    rows = await session.execute(select(Area).where(Area.active.is_(True)).order_by(Area.city, Area.name))
    return list(rows.scalars())


async def _prompts(session: AsyncSession, user_id: uuid.UUID) -> list[ProfilePrompt]:
    rows = await session.execute(
        select(ProfilePrompt).where(ProfilePrompt.user_id == user_id).order_by(ProfilePrompt.position)
    )
    return list(rows.scalars())


async def upsert_profile(session: AsyncSession, user_id: uuid.UUID, data: ProfileIn, now: datetime) -> None:
    area = await session.get(Area, data.area_id)
    if area is None or not area.active:
        raise ApiError(422, "unknown_area", "Choose an area from the list.")
    profile = await get_profile(session, user_id, lock=True)
    if profile is None:
        profile = Profile(user_id=user_id, area_id=area.id, area_changed_at=now, created_at=now)
        session.add(profile)
    elif profile.area_id != area.id:
        next_change = profile.area_changed_at + AREA_CHANGE_INTERVAL
        if now < next_change:
            wait = int((next_change - now).total_seconds())
            raise ApiError(
                429,
                "area_change_limited",
                "You can change your area once a day.",
                headers={"Retry-After": str(max(1, wait))},
            )
        profile.area_id = area.id
        profile.area_changed_at = now
    profile.display_name = data.display_name
    profile.gender = data.gender
    profile.interested_in = [g.value for g in data.interested_in]
    profile.intent = data.intent
    profile.bio = data.bio
    await session.flush()
    await session.execute(delete(ProfilePrompt).where(ProfilePrompt.user_id == user_id))
    for position, prompt in enumerate(data.prompts):
        session.add(ProfilePrompt(user_id=user_id, prompt_key=prompt.key, answer=prompt.answer, position=position))
    await session.commit()


async def update_privacy(session: AsyncSession, user_id: uuid.UUID, data: PrivacyIn) -> None:
    profile = await get_profile(session, user_id, lock=True)
    if profile is None:
        raise ApiError(409, "profile_required", "Create your profile first.")
    if data.visibility is not None:
        profile.visibility = data.visibility
    if data.discovery_paused is not None:
        profile.discovery_paused = data.discovery_paused
    await session.commit()


async def _area(session: AsyncSession, area_id: str) -> Area:
    area = await session.get(Area, area_id)
    if area is None:  # the foreign key makes this unreachable
        raise RuntimeError("profile area missing")
    return area


def _prompt_out(rows: list[ProfilePrompt]) -> list[PromptAnswerOut]:
    return [PromptAnswerOut(key=p.prompt_key, text=PROMPTS.get(p.prompt_key, ""), answer=p.answer) for p in rows]


async def my_profile(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user: User, now: datetime
) -> MyProfileOut | None:
    profile = await get_profile(session, user.id)
    if profile is None:
        return None
    area = await _area(session, profile.area_id)
    photos = await list_photos(session, user.id)
    approved = sum(p.moderation_state is ModerationState.approved for p in photos)
    missing: list[str] = [] if approved >= MIN_APPROVED_FOR_DISCOVERY else ["approved_photos"]
    return MyProfileOut(
        user_id=user.id,
        display_name=profile.display_name,
        age=age_on(user.birthdate, local_today(settings, now)),
        gender=profile.gender,
        interested_in=list(profile.interested_in),
        intent=profile.intent,
        bio=profile.bio,
        area=AreaOut(id=area.id, city=area.city, name=area.name),
        prompts=_prompt_out(await _prompts(session, user.id)),
        photos=[photo_out(p, storage, now) for p in photos],
        visibility=profile.visibility,
        discovery_paused=profile.discovery_paused,
        readiness=Readiness(
            ready=not missing,
            missing=missing,
            approved_photos=approved,
            approved_photos_needed=MIN_APPROVED_FOR_DISCOVERY,
        ),
    )


async def public_profile(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, target_id: uuid.UUID, now: datetime
) -> PublicProfileOut | None:
    profile = await get_profile(session, target_id)
    user = await session.get(User, target_id)
    if profile is None or user is None:
        return None
    area = await _area(session, profile.area_id)
    photos = [
        p
        for p in await list_photos(session, target_id)
        if p.moderation_state is ModerationState.approved  # others only ever see approved photos
    ]
    return PublicProfileOut(
        user_id=target_id,
        display_name=profile.display_name,
        age=age_on(user.birthdate, local_today(settings, now)),
        gender=profile.gender,
        intent=profile.intent,
        bio=profile.bio,
        area=AreaOut(id=area.id, city=area.city, name=area.name),
        prompts=_prompt_out(await _prompts(session, target_id)),
        photos=[photo_out(p, storage, now) for p in photos],
    )
