"""Live: random one-to-one video calls (stage 23, D123).

Pairing happens in one transaction under one advisory lock, so every pairing is
serialised: two members joining at the same moment can't both miss each other,
and nobody ends up in two calls.
1. An open call of the member's is ended if its time is up, else returned.
2. The member must be ready: the Live rules accepted, a profile with 2 approved
   photos, not paused, not held by an open report from a call, and a call left
   (a free one, or the plan).
3. The longest-waiting member who is ready too and suits them both ways (gender
   and age preferences, no block either way, not paired with each other in the
   last `calls_repeat_hours`) is taken from the queue.
4. Otherwise the member waits in the queue and sends a heartbeat.

The two devices exchange session descriptions through the API, each with all its
candidates (no trickle ICE). On servers people use they're cleaned of every
address but the relay's (sdp.py). The first device to report the connection
starts the clock: the call may run `limit_s` seconds, the shorter of the two
allowances (a free call is a minute). Free calls are counted then, so a call that
never connects costs nothing. Time limits are applied whenever a call is read or
changed, with no background job. The apps hang up when the time runs out, and the
record ends at `ends_at` whatever they do.

Realtime hints (`call.updated`) tell the other device to refetch. The apps also
poll, so a lost hint only slows a call's setup down.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Any

from sqlalchemy import and_, any_, delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.config import Settings
from app.errors import ApiError
from app.modules.accounts.models import User
from app.modules.auth.service import age_on, local_today
from app.modules.billing import service as billing
from app.modules.calls.models import Call, CallEndReason, CallMember, CallQueueEntry, CallState
from app.modules.calls.schemas import CallOut, CallPeer, LiveOut, QueueOut, Readiness
from app.modules.calls.sdp import InvalidSdpError, clean_sdp
from app.modules.discovery import rules
from app.modules.discovery.models import Preferences
from app.modules.discovery.service import DEFAULT_AGE, approved_photo_count, base_available_to
from app.modules.media.service import MIN_APPROVED_FOR_DISCOVERY
from app.modules.profiles.models import Profile
from app.modules.safety.models import Report, ReportStatus
from app.ratelimit import Limit

# The Live rules a member accepts before a first call (the apps show them). A new
# version asks everyone again.
RULES_VERSION = "2026-11"
# pg_advisory_xact_lock(int, int): its own key space, apart from the pair locks.
_LOCK = (0x4C495645, 1)  # "LIVE"
HEARTBEAT_S = 4
# A call that has run past its end by this much is ended by the server.
GRACE = timedelta(seconds=5)
# A like after a call is possible for this long after it connected.
LIKE_WINDOW = timedelta(hours=24)
OPEN = (CallState.connecting, CallState.live)

QUEUE_LIMIT = Limit("live_queue", 1200, 3600)  # a heartbeat every 4 s, with room
# The apps poll a call every 5 s while it runs (1.5 s while connecting): a plan member
# in calls all hour stays well under this.
SIGNAL_LIMIT = Limit("call_signal", 3600, 3600)
ICE_LIMIT = Limit("call_ice", 120, 3600)  # relay credentials cost money
# Pairings a member may have in a day: far above real use, it stops anyone
# harvesting faces through Live.
DAILY_CALLS = 200

_MESSAGES: dict[str, str] = {
    "unavailable": "Live isn't available right now. Please try again later.",
    "rules": "Please read and accept the Live rules first.",
    "profile_incomplete": "You need 2 approved photos before you can use Live.",
    "paused": "Your profile is paused. Resume it in your privacy settings to use Live.",
    "on_hold": "Live is paused for you while we look at a report. We'll be in touch.",
    "no_calls_left": "You've used your free calls. More calls come with the plan.",
    "daily_limit": "That's a lot of calls for one day. Live opens again for you tomorrow.",
}
_STATUS = {"unavailable": 503, "daily_limit": 429}


def _not_ready(code: Readiness) -> ApiError:
    status = _STATUS.get(code, 409)
    return ApiError(status, f"live_{code}", _MESSAGES[code], headers={"Retry-After": "3600"} if status != 409 else None)


# --- who may call ----------------------------------------------------------------


def _on_hold(user_id: Any) -> ColumnElement[bool]:
    """An open report from a call holds the reported member out of Live until staff decide."""
    return exists().where(
        Report.subject_id == user_id,
        Report.call_id.is_not(None),
        Report.status.in_((ReportStatus.open, ReportStatus.in_review)),
    )


@dataclass(frozen=True)
class Allowance:
    can_call: bool
    seconds: int
    free: bool
    free_left: int
    plan: bool


def allowance(settings: Settings, member: CallMember | None, plan: bool) -> Allowance:
    left = max(0, settings.calls_free_count - (member.free_calls_used if member else 0))
    if plan:
        return Allowance(True, settings.calls_plan_seconds, False, left, True)
    return Allowance(left > 0, settings.calls_free_seconds, True, left, False)


@dataclass(frozen=True)
class Readying:
    code: Readiness
    member: CallMember | None
    profile: Profile | None
    allowance: Allowance


async def _readiness(session: AsyncSession, settings: Settings, user: User, available: bool, now: datetime) -> Readying:
    member = await session.get(CallMember, user.id)
    have = allowance(settings, member, await billing.has_plan(session, user.id, now))
    profile = await session.get(Profile, user.id)

    day_start = datetime.combine(local_today(settings, now), time.min, tzinfo=settings.tz)
    today = select(func.count()).select_from(Call).where(_of(user.id), Call.created_at >= day_start)
    code: Readiness = "ok"
    # In order: the first thing in the way is the one the member hears about.
    if not available:
        code = "unavailable"
    elif member is None or member.rules_version != RULES_VERSION:
        code = "rules"
    elif profile is None or await approved_photo_count(session, user.id) < MIN_APPROVED_FOR_DISCOVERY:
        code = "profile_incomplete"
    elif profile.discovery_paused:
        code = "paused"
    elif (await session.execute(select(_on_hold(user.id)))).scalar_one():
        code = "on_hold"
    elif not have.can_call:
        code = "no_calls_left"
    elif (await session.execute(today)).scalar_one() >= DAILY_CALLS:
        code = "daily_limit"
    return Readying(code, member, profile, have)


# --- calls -----------------------------------------------------------------------


def _due(settings: Settings, call: Call, now: datetime) -> tuple[CallEndReason, datetime] | None:
    """The reason and time a call ended by itself, if it has."""
    if call.state is CallState.connecting:
        deadline = call.created_at + timedelta(seconds=settings.calls_connect_timeout_s)
        if now >= deadline:
            return CallEndReason.timeout, deadline
    elif call.state is CallState.live and call.ends_at is not None and now >= call.ends_at + GRACE:
        return CallEndReason.limit, call.ends_at
    return None


def _end(call: Call, reason: CallEndReason, at: datetime) -> None:
    call.state = CallState.ended
    call.ended_at = at
    call.end_reason = reason
    call.offer_sdp = None  # descriptions are kept only while the call is open
    call.answer_sdp = None


def _settle(settings: Settings, call: Call, now: datetime) -> bool:
    """End the call if its time is up. True if it changed."""
    due = _due(settings, call, now)
    if due is None:
        return False
    _end(call, *due)
    return True


def _of(user_id: Any) -> ColumnElement[bool]:
    """Calls with this member (an ID, or a column)."""
    return or_(Call.user_a_id == user_id, Call.user_b_id == user_id)


async def _open_call(session: AsyncSession, settings: Settings, user_id: uuid.UUID, now: datetime) -> Call | None:
    """The member's open call, ending any whose time is up (within the caller's transaction)."""
    calls = (await session.execute(select(Call).where(_of(user_id), Call.state.in_(OPEN)).with_for_update())).scalars()
    found = None
    for call in calls:
        if not _settle(settings, call, now):
            found = call
    return found


async def _peer(session: AsyncSession, settings: Settings, user_id: uuid.UUID, now: datetime) -> CallPeer | None:
    row = (
        await session.execute(
            select(User.birthdate, Profile.display_name)
            .join(Profile, Profile.user_id == User.id)
            .where(User.id == user_id)
        )
    ).one_or_none()
    if row is None:
        return None
    return CallPeer(
        user_id=user_id, display_name=row.display_name, age=age_on(row.birthdate, local_today(settings, now))
    )


async def call_out(session: AsyncSession, settings: Settings, call: Call, me: uuid.UUID, now: datetime) -> CallOut:
    offerer = call.user_a_id == me
    return CallOut(
        id=call.id,
        role="offerer" if offerer else "answerer",
        client_id=call.client_a if offerer else call.client_b,
        state=call.state,
        peer=await _peer(session, settings, call.user_b_id if offerer else call.user_a_id, now),
        limit_s=call.limit_s,
        free=call.free_a if offerer else call.free_b,
        offer_sdp=None if offerer else call.offer_sdp,
        answer_sdp=call.answer_sdp if offerer else None,
        connected_at=call.connected_at,
        ends_at=call.ends_at,
        ended_at=call.ended_at,
        end_reason=call.end_reason,
        server_now=now,
    )


def other(call: Call, me: uuid.UUID) -> uuid.UUID:
    return call.user_b_id if call.user_a_id == me else call.user_a_id


async def _mine(session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, now: datetime) -> Call:
    """One of the member's calls, locked, with its time limit applied. 404 for anyone else's."""
    call = (
        await session.execute(select(Call).where(Call.id == call_id, _of(me)).with_for_update())
    ).scalar_one_or_none()
    if call is None:
        raise ApiError(404, "not_found")
    _settle(settings, call, now)
    return call


# --- the Live screen -------------------------------------------------------------


async def live(session: AsyncSession, settings: Settings, user: User, available: bool, now: datetime) -> LiveOut:
    call = await _open_call(session, settings, user.id, now)
    ready = await _readiness(session, settings, user, available, now)
    waiting = await session.get(CallQueueEntry, user.id)
    await session.commit()
    return LiveOut(
        available=available,
        ready=ready.code,
        rules_version=RULES_VERSION,
        rules_accepted=ready.member is not None and ready.member.rules_version == RULES_VERSION,
        free_calls=settings.calls_free_count,
        free_calls_left=ready.allowance.free_left,
        free_call_seconds=settings.calls_free_seconds,
        plan=ready.allowance.plan,
        plan_call_seconds=settings.calls_plan_seconds,
        waiting=waiting is not None and waiting.seen_at >= now - timedelta(seconds=settings.calls_queue_ttl_s),
        call=await call_out(session, settings, call, user.id, now) if call else None,
    )


async def accept_rules(session: AsyncSession, user_id: uuid.UUID, version: str, now: datetime) -> None:
    if version != RULES_VERSION:
        raise ApiError(409, "live_rules_changed", "The Live rules have changed. Please read them again.")
    await session.execute(
        pg_insert(CallMember)
        .values(user_id=user_id, rules_version=version, rules_accepted_at=now)
        .on_conflict_do_update(
            index_elements=[CallMember.user_id], set_={"rules_version": version, "rules_accepted_at": now}
        )
    )
    await session.commit()


# --- the queue -------------------------------------------------------------------


async def _partner(
    session: AsyncSession, settings: Settings, user: User, profile: Profile, now: datetime
) -> tuple[CallQueueEntry, Allowance] | None:
    """The longest-waiting member who suits this one both ways and can still call."""
    today = local_today(settings, now)
    prefs = await session.get(Preferences, user.id)
    age_min, age_max = (prefs.age_min, prefs.age_max) if prefs else DEFAULT_AGE
    oldest, youngest = rules.birthdate_bounds(today, age_min, age_max)
    my_age = age_on(user.birthdate, today)
    me = user.id
    met_lately = exists().where(
        or_(
            and_(Call.user_a_id == me, Call.user_b_id == User.id),
            and_(Call.user_a_id == User.id, Call.user_b_id == me),
        ),
        Call.created_at >= now - timedelta(hours=settings.calls_repeat_hours),
    )
    in_a_call = exists().where(_of(User.id), Call.state.in_(OPEN))
    rows = (
        await session.execute(
            select(CallQueueEntry, CallMember)
            .join(User, User.id == CallQueueEntry.user_id)
            .join(Profile, Profile.user_id == User.id)
            .join(CallMember, CallMember.user_id == User.id)
            .outerjoin(Preferences, Preferences.user_id == User.id)
            .where(
                CallQueueEntry.seen_at >= now - timedelta(seconds=settings.calls_queue_ttl_s),
                *base_available_to(me),  # active, not leaving, 2 approved photos, no block either way
                CallMember.rules_version == RULES_VERSION,
                Profile.discovery_paused.is_(False),
                Profile.gender.in_(list(profile.interested_in)),
                any_(Profile.interested_in) == profile.gender.value,
                User.birthdate > oldest,
                User.birthdate <= youngest,
                func.coalesce(Preferences.age_min, DEFAULT_AGE[0]) <= my_age,
                func.coalesce(Preferences.age_max, DEFAULT_AGE[1]) >= my_age,
                ~met_lately,
                ~in_a_call,
                ~_on_hold(User.id),
            )
            .order_by(CallQueueEntry.joined_at, CallQueueEntry.user_id)
            .limit(20)
        )
    ).all()
    for entry, member in rows:
        theirs = allowance(settings, member, await billing.has_plan(session, entry.user_id, now))
        if theirs.can_call:
            return entry, theirs
    return None


@dataclass(frozen=True)
class Joined:
    out: QueueOut
    notify: list[uuid.UUID]


async def join(
    session: AsyncSession, settings: Settings, user: User, *, client_id: str, available: bool, now: datetime
) -> Joined:
    """Wait for someone, or be paired with whoever has waited longest. Also the heartbeat."""
    await session.execute(select(func.pg_advisory_xact_lock(*_LOCK)))
    current = await _open_call(session, settings, user.id, now)
    if current is not None:
        out = QueueOut(state="paired", call=await call_out(session, settings, current, user.id, now), retry_after_s=0)
        await session.commit()
        return Joined(out, [])
    ready = await _readiness(session, settings, user, available, now)
    if ready.code != "ok" or ready.profile is None:
        await session.execute(delete(CallQueueEntry).where(CallQueueEntry.user_id == user.id))
        await session.commit()
        raise _not_ready(ready.code)

    found = await _partner(session, settings, user, ready.profile, now)
    if found is None:
        await session.execute(
            pg_insert(CallQueueEntry)
            .values(user_id=user.id, client_id=client_id, joined_at=now, seen_at=now)
            .on_conflict_do_update(  # a heartbeat keeps the member's place in the queue
                index_elements=[CallQueueEntry.user_id], set_={"client_id": client_id, "seen_at": now}
            )
        )
        await session.commit()
        return Joined(QueueOut(state="waiting", call=None, retry_after_s=HEARTBEAT_S), [])

    entry, theirs = found
    mine = ready.allowance
    await session.execute(delete(CallQueueEntry).where(CallQueueEntry.user_id.in_((user.id, entry.user_id))))
    call = Call(
        user_a_id=entry.user_id, user_b_id=user.id, client_a=entry.client_id, client_b=client_id,
        state=CallState.connecting, limit_s=min(theirs.seconds, mine.seconds),
        free_a=theirs.free, free_b=mine.free, created_at=now,
    )  # fmt: skip
    session.add(call)
    await session.flush()
    out = QueueOut(state="paired", call=await call_out(session, settings, call, user.id, now), retry_after_s=0)
    await session.commit()
    return Joined(out, [entry.user_id])


async def leave(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(CallQueueEntry).where(CallQueueEntry.user_id == user_id))
    await session.commit()


# --- a call's life ---------------------------------------------------------------


async def get(session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, now: datetime) -> CallOut:
    call = await _mine(session, settings, call_id, me, now)
    out = await call_out(session, settings, call, me, now)
    await session.commit()
    return out


logger = logging.getLogger(__name__)


def _clean(sdp: str, relay_only: bool, side: str) -> str:
    try:
        return clean_sdp(sdp, relay_only=relay_only)
    except InvalidSdpError as exc:
        # Why, and which side (never the description: it holds network details).
        logger.warning(
            "call description refused", extra={"event": "calls.invalid_sdp", "reason": str(exc), "side": side}
        )
        raise ApiError(422, "invalid_sdp", "The call's connection details weren't valid.") from exc


def _still_connecting(call: Call) -> None:
    if call.state is not CallState.connecting:
        raise ApiError(409, "call_not_connecting", "This call has already connected or ended.")


async def offer(
    session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, *, sdp: str, relay_only: bool,
    now: datetime,
) -> tuple[CallOut, uuid.UUID]:  # fmt: skip
    """The offerer's description. Returns the call and whom to tell."""
    call = await _mine(session, settings, call_id, me, now)
    if call.user_a_id != me:
        raise ApiError(409, "not_your_turn", "The other person makes the offer.")
    _still_connecting(call)
    if call.offer_sdp is not None:
        raise ApiError(409, "offer_sent", "The offer has already been sent.")
    call.offer_sdp = _clean(sdp, relay_only, "offer")
    out = await call_out(session, settings, call, me, now)
    await session.commit()
    return out, call.user_b_id


async def answer(
    session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, *, sdp: str, relay_only: bool,
    now: datetime,
) -> tuple[CallOut, uuid.UUID]:  # fmt: skip
    call = await _mine(session, settings, call_id, me, now)
    if call.user_b_id != me:
        raise ApiError(409, "not_your_turn", "The other person answers.")
    _still_connecting(call)
    if call.offer_sdp is None:
        raise ApiError(409, "no_offer_yet", "There's no offer to answer yet.")
    if call.answer_sdp is not None:
        raise ApiError(409, "answer_sent", "The answer has already been sent.")
    call.answer_sdp = _clean(sdp, relay_only, "answer")
    out = await call_out(session, settings, call, me, now)
    await session.commit()
    return out, call.user_a_id


async def connected(
    session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, now: datetime
) -> tuple[CallOut, list[uuid.UUID]]:
    """A device reports the connection. The first report starts the clock and
    counts the free calls; later ones change nothing."""
    call = await _mine(session, settings, call_id, me, now)
    notify: list[uuid.UUID] = []
    if call.state is CallState.ended:
        raise ApiError(409, "call_ended", "This call has ended.")
    if call.state is CallState.connecting:
        if call.offer_sdp is None or call.answer_sdp is None:
            raise ApiError(409, "not_connected_yet", "The call can't have connected yet.")
        call.state = CallState.live
        call.connected_at = now
        call.ends_at = now + timedelta(seconds=call.limit_s)
        for user_id in [u for u, free in ((call.user_a_id, call.free_a), (call.user_b_id, call.free_b)) if free]:
            await session.execute(
                update(CallMember)
                .where(CallMember.user_id == user_id)
                .values(free_calls_used=func.least(CallMember.free_calls_used + 1, settings.calls_free_count))
            )
        notify = [other(call, me)]
    out = await call_out(session, settings, call, me, now)
    await session.commit()
    return out, notify


async def end(
    session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, *, reason: str, now: datetime
) -> tuple[CallOut, list[uuid.UUID]]:
    """Hang up (idempotent). The time limit is the server's to say: a device's
    "limit" before the end counts as hanging up."""
    call = await _mine(session, settings, call_id, me, now)
    notify: list[uuid.UUID] = []
    if call.state is not CallState.ended:
        kind = CallEndReason(reason)
        at = now
        if kind is CallEndReason.limit:
            if call.ends_at is not None and now >= call.ends_at - timedelta(seconds=2):
                at = min(now, call.ends_at)
            else:
                kind = CallEndReason.hangup
        _end(call, kind, at)
        notify = [other(call, me)]
    out = await call_out(session, settings, call, me, now)
    await session.commit()
    return out, notify


async def ice_ttl(session: AsyncSession, settings: Settings, call_id: uuid.UUID, me: uuid.UUID, now: datetime) -> int:
    """How long relay credentials must last for this open call (404 if it isn't one)."""
    call = await _mine(session, settings, call_id, me, now)
    await session.commit()
    if call.state is CallState.ended:
        raise ApiError(409, "call_ended", "This call has ended.")
    return settings.calls_connect_timeout_s + call.limit_s + 60


# --- the rest of the app ---------------------------------------------------------


async def end_all_for(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> list[uuid.UUID]:
    """An account goes away (deletion, suspension, ban), within the caller's
    transaction: its open calls end and it leaves the queue. Returns the people
    to tell."""
    await session.execute(delete(CallQueueEntry).where(CallQueueEntry.user_id == user_id))
    calls = (await session.execute(select(Call).where(_of(user_id), Call.state.in_(OPEN)).with_for_update())).scalars()
    peers = []
    for call in calls:
        _end(call, CallEndReason.left, now)
        peers.append(other(call, user_id))
    return peers


async def met_on_call(session: AsyncSession, me: uuid.UUID, them: uuid.UUID, now: datetime) -> bool:
    """For a like after a call: a call between the two connected in the last day."""
    found = await session.execute(
        select(Call.id)
        .where(
            or_(and_(Call.user_a_id == me, Call.user_b_id == them), and_(Call.user_a_id == them, Call.user_b_id == me)),
            Call.connected_at.is_not(None),
            Call.connected_at >= now - LIKE_WINDOW,
        )
        .limit(1)
    )
    return found.scalar_one_or_none() is not None


async def call_between(session: AsyncSession, call_id: uuid.UUID, me: uuid.UUID, them: uuid.UUID) -> bool:
    """For a report from a call: the call was between these two."""
    call = await session.get(Call, call_id)
    return call is not None and {call.user_a_id, call.user_b_id} == {me, them}


def called_together(me: uuid.UUID, them: uuid.UUID) -> ColumnElement[bool]:
    """For reports: any call between the two (within the 90 days calls are kept)."""
    return exists().where(
        or_(and_(Call.user_a_id == me, Call.user_b_id == them), and_(Call.user_a_id == them, Call.user_b_id == me))
    )
