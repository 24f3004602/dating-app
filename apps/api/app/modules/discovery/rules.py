"""Pure discovery rules: distance buckets, intent compatibility, ranking.

Ranking is deterministic and explainable (D014): a small integer score, ties
broken by a stable hash of (viewer, candidate, date), so a set is the same
all day and different on another day. No machine learning.
"""

from __future__ import annotations

import hashlib
import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from app.modules.profiles.models import Intent

DistanceBucket = Literal["under_5_km", "5_to_15_km", "15_to_50_km", "over_50_km"]
BUCKET_LIMITS: tuple[tuple[float, DistanceBucket], ...] = (
    (5, "under_5_km"),
    (15, "5_to_15_km"),
    (50, "15_to_50_km"),
)
EARTH_RADIUS_KM = 6371.0

# Who can be introduced to whom by intent (symmetric; D065). Marriage-minded
# members meet marriage or long-term; "figuring out" does not meet marriage.
COMPATIBLE: frozenset[frozenset[Intent]] = frozenset(
    {
        frozenset({Intent.marriage}),
        frozenset({Intent.marriage, Intent.long_term}),
        frozenset({Intent.long_term}),
        frozenset({Intent.long_term, Intent.figuring_out}),
        frozenset({Intent.figuring_out}),
    }
)


def intents_compatible(a: Intent, b: Intent) -> bool:
    return frozenset({a, b}) in COMPATIBLE


def compatible_with(intent: Intent) -> list[Intent]:
    return [other for other in Intent if intents_compatible(intent, other)]


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two area centroids (never member positions)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def bucket(km: float) -> DistanceBucket:
    for limit, name in BUCKET_LIMITS:
        if km < limit:
            return name
    return "over_50_km"


def within(km: float, max_km: int | None) -> bool:
    return max_km is None or km < max_km


def birthdate_bounds(today: date, age_min: int, age_max: int) -> tuple[date, date]:
    """Birthdates whose age today is in [age_min, age_max]: (oldest_exclusive, youngest_inclusive)."""

    def years_ago(n: int) -> date:
        try:
            return today.replace(year=today.year - n)
        except ValueError:  # 29 February
            return today.replace(year=today.year - n, day=28)

    return years_ago(age_max + 1), years_ago(age_min)


@dataclass(frozen=True)
class CandidateFacts:
    user_id: uuid.UUID
    intent: Intent
    prompt_keys: frozenset[str]
    has_bio: bool
    approved_photos: int
    last_active_at: datetime | None
    bucket: DistanceBucket


def score(viewer_intent: Intent, viewer_prompts: frozenset[str], c: CandidateFacts, now: datetime) -> int:
    points = 3 if c.intent is viewer_intent else 0
    points += len(viewer_prompts & c.prompt_keys)
    if c.last_active_at is not None:
        idle = now - c.last_active_at
        points += 2 if idle <= timedelta(days=1) else 1 if idle <= timedelta(days=7) else 0
    points += int(c.has_bio) + int(len(c.prompt_keys) >= 3) + int(c.approved_photos >= 4)
    points += {"under_5_km": 2, "5_to_15_km": 1}.get(c.bucket, 0)
    return points


def tie_break(viewer_id: uuid.UUID, candidate_id: uuid.UUID, day: date) -> str:
    return hashlib.sha256(f"{viewer_id}:{candidate_id}:{day.isoformat()}".encode()).hexdigest()


def rank(
    viewer_id: uuid.UUID,
    *,
    viewer_intent: Intent,
    viewer_prompts: frozenset[str],
    candidates: list[CandidateFacts],
    day: date,
    now: datetime,
    size: int,
) -> list[CandidateFacts]:
    return sorted(
        candidates,
        key=lambda c: (-score(viewer_intent, viewer_prompts, c, now), tie_break(viewer_id, c.user_id, day)),
    )[:size]
