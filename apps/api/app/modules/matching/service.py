"""Likes, passes and atomic mutual matching (F04, D024, D070).

One transaction per decision:
1. lock the actor's user row: serialises their likes, so the daily limit
   cannot be raced;
2. `pg_advisory_xact_lock` on the ordered pair: serialises two people
   deciding about each other at the same moment, so a reciprocal like is
   never missed (each would otherwise miss the other's uncommitted row);
3. re-check that the target is reachable (today's set, or they liked the
   actor) and available (blocks, account state) inside the lock;
4. insert the interaction (unique per pair: no second decision, no undo);
5. if both liked, insert the match with ON CONFLICT DO NOTHING on the
   unique ordered pair: duplicates are impossible even if the lock failed.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, time, timedelta

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import Settings
from app.errors import ApiError
from app.logs import request_id_var
from app.modules.accounts.models import User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth.service import age_on, local_today
from app.modules.discovery.models import Block, Interaction, InteractionKind, Match
from app.modules.discovery.service import approved_photo_count, base_available_to, in_todays_set
from app.modules.matching.schemas import (
    InteractionIn,
    InteractionOut,
    LikeAbout,
    LikeReceivedOut,
    MatchOut,
    PersonBrief,
)
from app.modules.media.models import ModerationState, Photo
from app.modules.media.service import MIN_APPROVED_FOR_DISCOVERY, list_photos, photo_out
from app.modules.profiles.catalogue import PROMPTS
from app.modules.profiles.models import Profile, ProfilePrompt
from app.modules.profiles.service import public_profile
from app.providers.storage import ObjectStorage
from app.ratelimit import Limit

DECIDE_LIMIT = Limit("interactions", 120, 3600)  # abuse ceiling; the like limit itself is per day in PostgreSQL


def ordered(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (a, b) if a < b else (b, a)


def pair_lock_key(a: uuid.UUID, b: uuid.UUID) -> int:
    lo, hi = ordered(a, b)
    return int.from_bytes(hashlib.sha256(lo.bytes + hi.bytes).digest()[:8], "big", signed=True)


def day_start(settings: Settings, now: datetime) -> datetime:
    return datetime.combine(local_today(settings, now), time.min, tzinfo=settings.tz)


async def likes_used_today(session: AsyncSession, settings: Settings, actor_id: uuid.UUID, now: datetime) -> int:
    stmt = (
        select(func.count())
        .select_from(Interaction)
        .where(
            Interaction.actor_id == actor_id,
            Interaction.kind == InteractionKind.like,
            Interaction.created_at >= day_start(settings, now),
        )
    )
    return int((await session.execute(stmt)).scalar_one())


async def liked_me(session: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    """`target` liked `viewer`, the viewer has not decided yet, and the target is still available."""
    row = (
        await session.execute(
            select(User.id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                User.id == target_id,
                *base_available_to(viewer_id),
                Profile.discovery_paused.is_(False),
                exists().where(
                    Interaction.actor_id == target_id,
                    Interaction.target_id == viewer_id,
                    Interaction.kind == InteractionKind.like,
                ),
                ~exists().where(Interaction.actor_id == viewer_id, Interaction.target_id == target_id),
            )
        )
    ).scalar_one_or_none()
    return row is not None


async def open_match_with(session: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID) -> Match | None:
    """An open match between the two, while neither has blocked the other and the other is active."""
    a, b = ordered(viewer_id, target_id)
    return (
        await session.execute(
            select(Match)
            .join(User, User.id == target_id)
            .where(
                Match.user_a_id == a,
                Match.user_b_id == b,
                Match.closed_at.is_(None),
                User.status == UserStatus.active,
                User.deletion_requested_at.is_(None),
                ~exists().where(
                    or_(
                        and_(Block.blocker_id == viewer_id, Block.blocked_id == target_id),
                        and_(Block.blocker_id == target_id, Block.blocked_id == viewer_id),
                    )
                ),
            )
        )
    ).scalar_one_or_none()


async def _brief(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, user_id: uuid.UUID, now: datetime
) -> PersonBrief:
    profile = await session.get(Profile, user_id)
    user = await session.get(User, user_id)
    if profile is None or user is None:
        raise RuntimeError("matched member without a profile")
    approved = [p for p in await list_photos(session, user_id) if p.moderation_state is ModerationState.approved]
    return PersonBrief(
        user_id=user_id,
        display_name=profile.display_name,
        age=age_on(user.birthdate, local_today(settings, now)),
        photo=photo_out(approved[0], storage, now) if approved else None,
    )


async def _match_out(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, match: Match, *, me: uuid.UUID, now: datetime
) -> MatchOut:
    other = match.user_b_id if match.user_a_id == me else match.user_a_id
    return MatchOut(
        id=match.id, matched_at=match.created_at, person=await _brief(session, settings, storage, other, now)
    )


async def _check_item(session: AsyncSession, target_id: uuid.UUID, data: InteractionIn) -> None:
    if data.photo_id is not None:
        photo = await session.get(Photo, data.photo_id)
        if photo is None or photo.user_id != target_id or photo.moderation_state is not ModerationState.approved:
            raise ApiError(422, "invalid_like_item", "Choose one of their photos or prompts.")
    if data.prompt_key is not None:
        found = (
            await session.execute(
                select(ProfilePrompt.id).where(
                    ProfilePrompt.user_id == target_id, ProfilePrompt.prompt_key == data.prompt_key
                )
            )
        ).scalar_one_or_none()
        if found is None:
            raise ApiError(422, "invalid_like_item", "Choose one of their photos or prompts.")


async def decide(
    session: AsyncSession,
    settings: Settings,
    storage: ObjectStorage,
    actor: User,
    *,
    data: InteractionIn,
    now: datetime,
) -> tuple[InteractionOut, bool]:
    """Returns (result, created). A repeat of the same decision returns the original (idempotent)."""
    if data.target_id == actor.id:
        raise ApiError(422, "invalid_target", "You can't like or pass on yourself.")
    if (
        await session.get(Profile, actor.id) is None
        or await approved_photo_count(session, actor.id) < MIN_APPROVED_FOR_DISCOVERY
    ):
        raise ApiError(409, "profile_incomplete", "Finish your profile (2 approved photos) to like people.")

    await session.execute(select(User.id).where(User.id == actor.id).with_for_update(key_share=True))
    await session.execute(select(func.pg_advisory_xact_lock(pair_lock_key(actor.id, data.target_id))))

    kind = InteractionKind.like if data.kind == "like" else InteractionKind.passed
    previous = (
        await session.execute(
            select(Interaction).where(Interaction.actor_id == actor.id, Interaction.target_id == data.target_id)
        )
    ).scalar_one_or_none()
    if previous is not None:
        if previous.kind is not kind:
            raise ApiError(409, "already_decided", "You've already decided about this person.")
        existing = await open_match_with(session, actor.id, data.target_id)
        used = await likes_used_today(session, settings, actor.id, now)
        await session.commit()
        out = InteractionOut(
            target_id=data.target_id, kind=data.kind, decided_at=previous.created_at,
            match=await _match_out(session, settings, storage, existing, me=actor.id, now=now) if existing else None,
            likes_left_today=max(0, settings.daily_like_limit - used),
        )  # fmt: skip
        return out, False

    # Reachability is re-checked inside the locks: blocks and state changes apply.
    reachable = await in_todays_set(session, settings, actor.id, data.target_id, now) or await liked_me(
        session, actor.id, data.target_id
    )
    if not reachable:
        raise ApiError(404, "not_found")

    used = await likes_used_today(session, settings, actor.id, now)
    if kind is InteractionKind.like:
        if used >= settings.daily_like_limit:
            wait = int((day_start(settings, now) + timedelta(days=1) - now).total_seconds())
            raise ApiError(
                429, "like_limit", f"You've used today's {settings.daily_like_limit} likes. More tomorrow.",
                headers={"Retry-After": str(max(1, wait))},
            )  # fmt: skip
        await _check_item(session, data.target_id, data)
        used += 1

    session.add(
        Interaction(
            actor_id=actor.id, target_id=data.target_id, kind=kind, comment=data.comment,
            target_photo_id=data.photo_id, target_prompt_key=data.prompt_key, created_at=now,
        )
    )  # fmt: skip
    await session.flush()

    match: Match | None = None
    if kind is InteractionKind.like:
        reciprocal = (
            await session.execute(
                select(Interaction.id).where(
                    Interaction.actor_id == data.target_id,
                    Interaction.target_id == actor.id,
                    Interaction.kind == InteractionKind.like,
                )
            )
        ).scalar_one_or_none()
        if reciprocal is not None:
            a, b = ordered(actor.id, data.target_id)
            await session.execute(
                pg_insert(Match)
                .values(user_a_id=a, user_b_id=b, created_at=now)
                .on_conflict_do_nothing(index_elements=[Match.user_a_id, Match.user_b_id])
            )
            match = (
                await session.execute(select(Match).where(Match.user_a_id == a, Match.user_b_id == b))
            ).scalar_one()
            session.add(
                AuditLog(actor_id=actor.id, action="match.created", target_type="match", target_id=match.id,
                         request_id=request_id_var.get())
            )  # fmt: skip
    await session.commit()
    out = InteractionOut(
        target_id=data.target_id, kind=data.kind, decided_at=now,
        match=await _match_out(session, settings, storage, match, me=actor.id, now=now) if match else None,
        likes_left_today=max(0, settings.daily_like_limit - used),
    )  # fmt: skip
    return out, True


async def likes_received(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, me: uuid.UUID, now: datetime
) -> list[LikeReceivedOut]:
    mine = aliased(Interaction)
    rows = (
        await session.execute(
            select(Interaction)
            .join(User, User.id == Interaction.actor_id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                Interaction.target_id == me,
                Interaction.kind == InteractionKind.like,
                *base_available_to(me),
                Profile.discovery_paused.is_(False),
                # An alias: the outer query also reads `interactions` (the like received).
                ~exists().where(mine.actor_id == me, mine.target_id == User.id),
            )
            .order_by(Interaction.created_at.desc())
            .limit(50)
        )
    ).scalars()
    out: list[LikeReceivedOut] = []
    for like in rows:
        person = await public_profile(session, settings, storage, like.actor_id, now)
        if person is None:
            continue
        about = None
        if like.target_photo_id or like.target_prompt_key:
            about = LikeAbout(
                photo_id=like.target_photo_id,
                prompt_key=like.target_prompt_key,
                prompt_text=PROMPTS.get(like.target_prompt_key) if like.target_prompt_key else None,
            )
        out.append(LikeReceivedOut(liked_at=like.created_at, comment=like.comment, about=about, person=person))
    return out


async def my_matches(
    session: AsyncSession, settings: Settings, storage: ObjectStorage, me: uuid.UUID, now: datetime
) -> list[MatchOut]:
    rows = (
        await session.execute(
            select(Match)
            .where(or_(Match.user_a_id == me, Match.user_b_id == me), Match.closed_at.is_(None))
            .order_by(Match.created_at.desc())
        )
    ).scalars()
    out: list[MatchOut] = []
    for match in rows:
        other = match.user_b_id if match.user_a_id == me else match.user_a_id
        if await open_match_with(session, me, other) is not None:
            out.append(await _match_out(session, settings, storage, match, me=me, now=now))
    return out
