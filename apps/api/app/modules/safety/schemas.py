from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from app.modules.safety.models import ReportReason, ReportStatus
from app.schemas import ApiModel
from app.text import clean_text


def _details(v: str) -> str:
    text = clean_text(v, max_lines=20)
    if len(text) > 1000:
        raise ValueError("at most 1000 characters")
    return text


class BlockIn(ApiModel):
    user_id: uuid.UUID


class BlockedOut(ApiModel):
    user_id: uuid.UUID
    display_name: str | None = Field(description="None if they have left")
    blocked_at: datetime


class ReportIn(ApiModel):
    subject_id: uuid.UUID
    reason: ReportReason
    details: Annotated[str, Field(min_length=1, max_length=1100), AfterValidator(_details)] | None = None
    # At most one item: one of their messages to me, or one of their photos.
    message_id: uuid.UUID | None = None
    photo_id: uuid.UUID | None = None
    # Reporting blocks by default (architecture); the reporter can opt out.
    block: bool = True

    @model_validator(mode="after")
    def _one_item(self) -> ReportIn:
        if self.message_id and self.photo_id:
            raise ValueError("report a message or a photo, not both")
        return self


class ReportOut(ApiModel):
    id: uuid.UUID
    reason: ReportReason
    about: Literal["profile", "message", "photo"]
    subject_name: str | None = Field(description="None if they have left")
    status: ReportStatus = Field(description="open, in_review, actioned or dismissed; never what action was taken")
    created_at: datetime
