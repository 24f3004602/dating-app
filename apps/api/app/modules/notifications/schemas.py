"""Request and response models for notifications."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas import ApiModel

# Expo push tokens look like ExponentPushToken[xxxxxxxx] (or ExpoPushToken[...]).
PushToken = Annotated[
    str, StringConstraints(pattern=r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$"), Field(repr=False)
]


class PushDeviceIn(ApiModel):
    token: PushToken
    platform: Literal["ios", "android"]


class PrefsBody(ApiModel):
    """What to push. Notices from the team are always delivered (in the app too)."""

    matches: bool
    messages: bool
    likes: bool


class NoticeOut(ApiModel):
    id: uuid.UUID
    kind: Literal["warning"]
    created_at: datetime
    read: bool
