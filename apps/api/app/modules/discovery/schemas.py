from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator

from app.modules.discovery.rules import DistanceBucket
from app.modules.profiles.schemas import PublicProfileOut
from app.schemas import ApiModel


class PreferencesIn(ApiModel):
    age_min: int = Field(ge=18, le=99)
    age_max: int = Field(ge=18, le=99)
    # None means any distance; otherwise one of the bucket limits.
    max_distance_km: Literal[5, 15, 50] | None = None

    @model_validator(mode="after")
    def _order(self) -> PreferencesIn:
        if self.age_min > self.age_max:
            raise ValueError("age_min must not exceed age_max")
        return self


class PreferencesOut(ApiModel):
    age_min: int
    age_max: int
    max_distance_km: Literal[5, 15, 50] | None
    applies_from: Literal["next_set"] = "next_set"


class DiscoveryCard(PublicProfileOut):
    """A profile in today's set: a distance bucket, never coordinates or km."""

    distance: DistanceBucket
    rank: int


class TodayOut(ApiModel):
    date: date
    cards: list[DiscoveryCard]
    size_limit: int
    next_set_at: datetime
