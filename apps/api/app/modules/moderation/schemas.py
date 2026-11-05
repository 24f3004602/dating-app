from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, Field

from app.modules.accounts.models import UserStatus
from app.modules.profiles.schemas import PhotoOut, PromptAnswerOut
from app.modules.safety.models import ActionKind, ReportReason, ReportStatus
from app.schemas import ApiModel
from app.text import clean_text


def _note(v: str) -> str:
    text = clean_text(v, max_lines=10)
    if len(text) > 500:
        raise ValueError("at most 500 characters")
    return text


Note = Annotated[str, Field(min_length=1, max_length=550), AfterValidator(_note)]


class SubjectBrief(ApiModel):
    user_id: uuid.UUID
    display_name: str | None
    account_status: UserStatus


class QueueItem(ApiModel):
    id: uuid.UUID
    reason: ReportReason
    priority: int = Field(description="1 first (underage), 2 harm, 3 the rest")
    status: ReportStatus
    about: Literal["profile", "message", "photo"]
    created_at: datetime
    subject: SubjectBrief | None = Field(description="None if the account has gone")
    assignee_id: uuid.UUID | None
    open_reports_on_subject: int


class ActionOut(ApiModel):
    id: uuid.UUID
    action: ActionKind
    moderator_id: uuid.UUID
    target_user_id: uuid.UUID | None
    report_id: uuid.UUID | None
    note: str | None
    created_at: datetime


class SubjectDetail(ApiModel):
    """What members could see of them, plus the account state. Never their
    email, birthdate, location or conversations."""

    user_id: uuid.UUID
    display_name: str | None
    age: int
    account_status: UserStatus
    joined: date
    bio: str | None
    prompts: list[PromptAnswerOut]
    photos: list[PhotoOut] = Field(description="Every photo, any moderation state")
    reports_on_subject: int


class ReportDetail(ApiModel):
    id: uuid.UUID
    reason: ReportReason
    details: str | None
    status: ReportStatus
    priority: int
    created_at: datetime
    reporter_id: uuid.UUID | None = Field(description="Pseudonymous: an ID, never the reporter's profile")
    assignee_id: uuid.UUID | None
    evidence_text: str | None = Field(description="A copy of the reported message: the only message text staff see")
    message_removed: bool
    photo: PhotoOut | None
    subject: SubjectDetail | None
    history: list[ActionOut] = Field(description="Earlier actions on this account")


class ReportActionIn(ApiModel):
    action: Literal["dismiss", "warn", "remove_photo", "remove_message", "suspend", "ban"]
    note: Note | None = None


class PendingPhoto(ApiModel):
    user_id: uuid.UUID
    display_name: str | None
    photo: PhotoOut


class PhotoDecisionIn(ApiModel):
    decision: Literal["approve", "reject"]
    note: Note | None = None


class AccountActionIn(ApiModel):
    action: Literal["suspend", "ban", "reinstate"]
    note: Note = Field(description="Required: why")


class AuditEntryOut(ApiModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    request_id: str | None
    details: dict[str, Any]
    created_at: datetime
