"""Photo checks (stage 29b, D164): the member's view, the staff queue and a decision."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.modules.photochecks.models import CheckState, Gesture, RejectReason
from app.modules.profiles.schemas import PhotoOut, PhotoUrls
from app.schemas import ApiModel

MemberState = Literal["none", "awaiting", "pending", "verified", "rejected", "removed"]


class PhotoCheckOut(ApiModel):
    """The blue tick, as its member sees it (D164)."""

    state: MemberState = Field(
        description="none; awaiting (a gesture to make); pending (our team is looking); verified (the tick); "
        "rejected (the last check failed); removed (the tick went when a photo was added)"
    )
    gesture: Gesture | None = Field(description="The gesture to make in the selfie, while awaiting")
    expires_at: datetime | None = Field(description="When the gesture's time runs out, while awaiting")
    reason: RejectReason | None = Field(description="Why the last check failed, when rejected")
    verified_at: datetime | None = Field(description="When our team approved it, while verified")


class PendingCheckOut(ApiModel):
    """A selfie waiting for review, beside every photo of the member's (staff only, audited)."""

    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str | None
    gesture: Gesture
    submitted_at: datetime
    selfie: PhotoUrls
    selfie_expires_at: datetime
    photos: list[PhotoOut] = Field(description="The member's photos in order, pending ones included")


class CheckDecisionIn(ApiModel):
    decision: Literal["approve", "reject"]
    reason: RejectReason | None = Field(default=None, description="Required to reject; none to approve")

    @model_validator(mode="after")
    def _reason_with_rejection(self) -> CheckDecisionIn:
        if (self.decision == "reject") != (self.reason is not None):
            raise ValueError("a rejection needs a reason, and an approval has none")
        return self


class CheckDecisionOut(ApiModel):
    id: uuid.UUID
    state: CheckState
