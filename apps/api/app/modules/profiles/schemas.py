"""Profile, prompt, area, privacy and photo models for /v1."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import UploadFile
from pydantic import AfterValidator, Field, field_validator, model_validator

from app.modules.media.models import ModerationState
from app.modules.profiles.catalogue import MAX_PROMPTS, PROMPTS
from app.modules.profiles.models import Gender, Intent, Visibility
from app.schemas import ApiModel
from app.text import clean_display_name, clean_text

DisplayName = Annotated[str, Field(min_length=1, max_length=60), AfterValidator(clean_display_name)]


def _bio(v: str) -> str:
    return clean_text(v, max_lines=8)


def _answer(v: str) -> str:
    return clean_text(v, max_lines=4)


class PromptIn(ApiModel):
    key: str = Field(max_length=32)
    answer: Annotated[str, Field(min_length=1, max_length=260), AfterValidator(_answer)]

    @field_validator("key")
    @classmethod
    def _known(cls, v: str) -> str:
        if v not in PROMPTS:
            raise ValueError("unknown prompt")
        return v

    @field_validator("answer")
    @classmethod
    def _length(cls, v: str) -> str:
        if not 1 <= len(v) <= 200:
            raise ValueError("answers are 1 to 200 characters")
        return v


class ProfileIn(ApiModel):
    display_name: DisplayName
    gender: Gender
    interested_in: list[Gender] = Field(min_length=1, max_length=3)
    intent: Intent
    bio: Annotated[str, Field(max_length=700), AfterValidator(_bio)] | None = None
    area_id: str = Field(max_length=48)
    prompts: list[PromptIn] = Field(default_factory=list, max_length=MAX_PROMPTS)

    @field_validator("display_name")
    @classmethod
    def _name_length(cls, v: str) -> str:
        if not 1 <= len(v) <= 40:
            raise ValueError("names are 1 to 40 characters")
        return v

    @field_validator("bio")
    @classmethod
    def _bio_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 500:
            raise ValueError("the bio is at most 500 characters")
        return v or None

    @model_validator(mode="after")
    def _unique(self) -> ProfileIn:
        if len(set(self.interested_in)) != len(self.interested_in):
            raise ValueError("interested_in has duplicates")
        keys = [p.key for p in self.prompts]
        if len(set(keys)) != len(keys):
            raise ValueError("each prompt can be answered once")
        return self


class PrivacyIn(ApiModel):
    visibility: Visibility | None = None
    discovery_paused: bool | None = None

    @model_validator(mode="after")
    def _something(self) -> PrivacyIn:
        if self.visibility is None and self.discovery_paused is None:
            raise ValueError("send visibility, discovery_paused or both")
        return self


class AreaOut(ApiModel):
    """No coordinates: they never leave the server (D020)."""

    id: str
    city: str
    name: str


class PromptOut(ApiModel):
    key: str
    text: str


class PromptAnswerOut(ApiModel):
    key: str
    text: str
    answer: str


class PhotoUrls(ApiModel):
    large: str
    small: str


class PhotoOut(ApiModel):
    id: uuid.UUID
    position: int
    moderation_state: ModerationState
    width: int
    height: int
    urls: PhotoUrls
    urls_expire_at: datetime


class PhotoUploadForm(ApiModel):
    """Multipart form for an upload: one `file`; unknown form fields are rejected."""

    file: UploadFile


class PhotoOrderIn(ApiModel):
    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=6)


class Readiness(ApiModel):
    """What is still needed before the profile can appear in discovery."""

    ready: bool
    missing: list[Literal["profile", "approved_photos"]]
    approved_photos: int
    approved_photos_needed: int


class MyProfileOut(ApiModel):
    user_id: uuid.UUID
    display_name: str
    age: int
    gender: Gender
    interested_in: list[Gender]
    intent: Intent
    bio: str | None
    area: AreaOut
    prompts: list[PromptAnswerOut]
    photos: list[PhotoOut]
    visibility: Visibility
    discovery_paused: bool
    readiness: Readiness


class PublicProfileOut(ApiModel):
    """What another member sees: no email, birthdate, settings or coordinates."""

    user_id: uuid.UUID
    display_name: str
    age: int
    gender: Gender
    intent: Intent
    bio: str | None
    area: AreaOut
    prompts: list[PromptAnswerOut]
    photos: list[PhotoOut]
