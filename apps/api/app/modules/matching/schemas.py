from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from app.modules.profiles.schemas import PhotoOut, PublicProfileOut
from app.schemas import ApiModel
from app.text import clean_text


def _comment(v: str) -> str:
    return clean_text(v, max_lines=3)


class InteractionIn(ApiModel):
    target_id: uuid.UUID
    kind: Literal["like", "pass"]
    # A like may say what it is about: one photo or one prompt, plus a short note.
    comment: Annotated[str, Field(min_length=1, max_length=200), AfterValidator(_comment)] | None = None
    photo_id: uuid.UUID | None = None
    prompt_key: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def _shape(self) -> InteractionIn:
        if self.comment is not None and len(self.comment) > 150:
            raise ValueError("comments are at most 150 characters")
        if self.kind == "pass" and (self.comment or self.photo_id or self.prompt_key):
            raise ValueError("a pass carries no comment or item")
        if self.photo_id and self.prompt_key:
            raise ValueError("choose a photo or a prompt, not both")
        return self


class PersonBrief(ApiModel):
    user_id: uuid.UUID
    display_name: str
    age: int
    photo: PhotoOut | None


class LastMessage(ApiModel):
    n: int
    from_me: bool
    preview: str = Field(description="The first 100 characters")
    sent_at: datetime


class MatchOut(ApiModel):
    id: uuid.UUID
    matched_at: datetime
    person: PersonBrief
    last_message: LastMessage | None
    unread: int
    your_turn: bool = Field(description="They wrote last, recently: counts towards the your-turn cap")


class InteractionOut(ApiModel):
    target_id: uuid.UUID
    kind: Literal["like", "pass"]
    decided_at: datetime
    match: MatchOut | None
    likes_left_today: int


class LikeAbout(ApiModel):
    photo_id: uuid.UUID | None
    prompt_key: str | None
    prompt_text: str | None


class LikeReceivedOut(ApiModel):
    liked_at: datetime
    comment: str | None
    about: LikeAbout | None
    person: PublicProfileOut
