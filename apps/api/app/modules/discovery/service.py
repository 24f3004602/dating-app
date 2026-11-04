"""Discovery: preferences and today's finite set (F03, D014, D065).

Filters run before ranking, in SQL:
- availability ("hard" rules, re-checked every time a set is read, so a
  block, pause, suspension or photo removal takes effect at once): active
  account, not leaving, a profile visible to everyone, not paused, at least
  2 approved photos, no block in either direction, the candidate has not
  passed on the viewer, the viewer has not already acted on the candidate;
- matching (applied when the set is built): gender both ways, age both
  ways, compatible intents, and distance both ways on area centroids.
Then the deterministic ranking (rules.py) picks at most `discovery_set_size`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import and_, any_, delete, exists, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.config import Settings
from app.errors import ApiError
from app.modules.accounts.models import User, UserStatus
from app.modules.auth.service import age_on, local_today
from app.modules.discovery import rules
from app.modules.discovery.models import Block, DailyPick, Interaction, InteractionKind, Preferences
from app.modules.discovery.schemas import DiscoveryCard, PreferencesIn, PreferencesOut, TodayOut
from app.modules.media.models import ModerationState, Photo
from app.modules.media.service import MIN_APPROVED_FOR_DISCOVERY
from app.modules.profiles.models import Area, Profile, ProfilePrompt, Visibility
from app.modules.profiles.service import public_profile
from app.providers.storage import ObjectStorage
from app.ratelimit import Limit

DEFAULT_AGE = (18, 99)
TODAY_LIMIT = Limit("discovery_today", 60, 3600)
PROFILE_VIEW_LIMIT = Limit("profile_view", 120, 3600)


# --- preferences ---------------------------------------------------------------


async def get_preferences(session: AsyncSession, user_id: uuid.UUID) -> PreferencesOut:
    prefs = await session.get(Preferences, user_id)
    if prefs is None:
        return PreferencesOut(age_min=DEFAULT_AGE[0], age_max=DEFAULT_AGE[1], max_distance_km=None)
    return PreferencesOut(age_min=prefs.age_min, age_max=prefs.age_max, max_distance_km=prefs.max_distance_km)


async def put_preferences(session: AsyncSession, user_id: uuid.UUID, data: PreferencesIn) -> PreferencesOut:
    prefs = await session.get(Preferences, user_id, with_for_update=True)
    if prefs is None:
        prefs = Preferences(user_id=user_id)
        session.add(prefs)
    prefs.age_min, prefs.age_max, prefs.max_distance_km = data.age_min, data.age_max, data.max_distance_km
    await session.commit()
    return await get_preferences(session, user_id)


# --- eligibility ------------------------------------------------------------------


def _approved_photos(user_id: Any) -> ColumnElement[int]:
    return (
        select(func.count())
        .select_from(Photo)
        .where(Photo.user_id == user_id, Photo.moderation_state == ModerationState.approved)
        .scalar_subquery()
    )


def available_to(viewer_id: uuid.UUID) -> list[ColumnElement[bool]]:
    """The hard rules for a candidate row (User joined with Profile)."""
    return [
        User.id != viewer_id,
        User.status == UserStatus.active,
        User.deletion_requested_at.is_(None),
        Profile.visibility == Visibility.everyone,
        Profile.discovery_paused.is_(False),
        _approved_photos(User.id) >= MIN_APPROVED_FOR_DISCOVERY,
        ~exists().where(
            or_(
                and_(Block.blocker_id == viewer_id, Block.blocked_id == User.id),
                and_(Block.blocker_id == User.id, Block.blocked_id == viewer_id),
            )
        ),
        ~exists().where(Interaction.actor_id == viewer_id, Interaction.target_id == User.id),
        ~exists().where(
            Interaction.actor_id == User.id,
            Interaction.target_id == viewer_id,
            Interaction.kind == InteractionKind.passed,
        ),
    ]


@dataclass(frozen=True)
class Viewer:
    user: User
    profile: Profile
    area: Area
    prefs: PreferencesOut
    age: int
    prompt_keys: frozenset[str]


async def _viewer(session: AsyncSession, settings: Settings, user: User, today: date) -> Viewer:
    profile = await session.get(Profile, user.id)
    if profile is None:
        raise ApiError(409, "profile_incomplete", "Finish your profile to see introductions.")
    approved = (await session.execute(select(_approved_photos(user.id)))).scalar_one()
    if approved < MIN_APPROVED_FOR_DISCOVERY:
        raise ApiError(
            409,
            "profile_incomplete",
            "You need 2 approved photos before you can see introductions.",
            extra={"approved_photos": approved, "approved_photos_needed": MIN_APPROVED_FOR_DISCOVERY},
        )
    if profile.discovery_paused:
        raise ApiError(409, "discovery_paused", "Introductions are paused. Resume them in your privacy settings.")
    area = await session.get(Area, profile.area_id)
    if area is None:
        raise RuntimeError("profile area missing")
    keys = (await session.execute(select(ProfilePrompt.prompt_key).where(ProfilePrompt.user_id == user.id))).scalars()
    return Viewer(
        user=user,
        profile=profile,
        area=area,
        prefs=await get_preferences(session, user.id),
        age=age_on(user.birthdate, today),
        prompt_keys=frozenset(keys),
    )


async def _build(session: AsyncSession, settings: Settings, v: Viewer, today: date, now: datetime) -> list[DailyPick]:
    oldest, youngest = rules.birthdate_bounds(today, v.prefs.age_min, v.prefs.age_max)
    candidate_age_ok = and_(User.birthdate > oldest, User.birthdate <= youngest)
    # The candidate's own age preferences must include the viewer (defaults: 18-99).
    viewer_age_ok = and_(
        func.coalesce(Preferences.age_min, DEFAULT_AGE[0]) <= v.age,
        func.coalesce(Preferences.age_max, DEFAULT_AGE[1]) >= v.age,
    )
    rows = (
        await session.execute(
            select(User, Profile, Area, Preferences.max_distance_km, _approved_photos(User.id))
            .join(Profile, Profile.user_id == User.id)
            .join(Area, Area.id == Profile.area_id)
            .outerjoin(Preferences, Preferences.user_id == User.id)
            .where(
                *available_to(v.user.id),
                Profile.gender.in_([g for g in v.profile.interested_in]),
                any_(Profile.interested_in) == v.profile.gender.value,  # candidate wants the viewer's gender
                Profile.intent.in_(rules.compatible_with(v.profile.intent)),
                candidate_age_ok,
                viewer_age_ok,
            )
        )
    ).all()

    facts: list[rules.CandidateFacts] = []
    for user, profile, area, their_max_km, approved in rows:
        km = rules.distance_km(
            float(v.area.latitude), float(v.area.longitude), float(area.latitude), float(area.longitude)
        )
        if not (rules.within(km, v.prefs.max_distance_km) and rules.within(km, their_max_km)):
            continue
        keys = (
            await session.execute(select(ProfilePrompt.prompt_key).where(ProfilePrompt.user_id == user.id))
        ).scalars()
        facts.append(
            rules.CandidateFacts(
                user_id=user.id,
                intent=profile.intent,
                prompt_keys=frozenset(keys),
                has_bio=bool(profile.bio),
                approved_photos=int(approved),
                last_active_at=user.last_active_at,
                bucket=rules.bucket(km),
            )
        )
    chosen = rules.rank(
        v.user.id,
        viewer_intent=v.profile.intent,
        viewer_prompts=v.prompt_keys,
        candidates=facts,
        day=today,
        now=now,
        size=settings.discovery_set_size,
    )
    return [
        DailyPick(viewer_id=v.user.id, pick_date=today, candidate_id=c.user_id, rank=i + 1, distance_bucket=c.bucket)
        for i, c in enumerate(chosen)
    ]


async def _stored(session: AsyncSession, viewer_id: uuid.UUID, today: date) -> list[DailyPick]:
    rows = await session.execute(
        select(DailyPick).where(DailyPick.viewer_id == viewer_id, DailyPick.pick_date == today).order_by(DailyPick.rank)
    )
    return list(rows.scalars())


async def _still_available(session: AsyncSession, viewer_id: uuid.UUID, ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not ids:
        return set()
    rows = await session.execute(
        select(User.id).join(Profile, Profile.user_id == User.id).where(User.id.in_(ids), *available_to(viewer_id))
    )
    return set(rows.scalars())


def next_set_at(settings: Settings, today: date) -> datetime:
    return datetime.combine(today + timedelta(days=1), time.min, tzinfo=settings.tz)


async def today(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user: User, now: datetime
) -> TodayOut:
    day = local_today(settings, now)
    viewer = await _viewer(session, settings, user, day)
    # One generation per viewer and day, even with concurrent requests.
    await session.execute(select(User.id).where(User.id == user.id).with_for_update())
    picks = await _stored(session, user.id, day)
    if not picks:
        picks = await _build(session, settings, viewer, day, now)
        if picks:
            await session.execute(
                insert(DailyPick),
                [
                    {
                        "viewer_id": p.viewer_id,
                        "pick_date": p.pick_date,
                        "candidate_id": p.candidate_id,
                        "rank": p.rank,
                        "distance_bucket": p.distance_bucket,
                        "created_at": now,
                    }
                    for p in picks
                ],
            )
        # Retention: daily picks are kept 7 days (privacy inventory).
        await session.execute(
            delete(DailyPick).where(DailyPick.viewer_id == user.id, DailyPick.pick_date < day - timedelta(days=7))
        )
    await session.commit()

    available = await _still_available(session, user.id, [p.candidate_id for p in picks])
    cards: list[DiscoveryCard] = []
    for pick in picks:
        if pick.candidate_id not in available:
            continue  # became unavailable today (block, pause, suspension, photo removal)
        public = await public_profile(session, settings, storage, pick.candidate_id, now)
        if public is not None:
            cards.append(DiscoveryCard(**public.model_dump(), distance=pick.distance_bucket, rank=pick.rank))
    return TodayOut(
        date=day, cards=cards, size_limit=settings.discovery_set_size, next_set_at=next_set_at(settings, day)
    )


async def in_todays_set(
    session: AsyncSession, settings: Settings, viewer_id: uuid.UUID, target_id: uuid.UUID, now: datetime
) -> bool:
    """For the access policy: in today's set and still available to this viewer."""
    day = local_today(settings, now)
    found = (
        await session.execute(
            select(DailyPick.candidate_id).where(
                DailyPick.viewer_id == viewer_id, DailyPick.pick_date == day, DailyPick.candidate_id == target_id
            )
        )
    ).scalar_one_or_none()
    return found is not None and target_id in await _still_available(session, viewer_id, [target_id])
