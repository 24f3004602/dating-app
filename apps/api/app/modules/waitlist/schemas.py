"""Waitlist requests (stage 20c, D101)."""

from __future__ import annotations

from pydantic import Field

from app.modules.auth.schemas import Email
from app.schemas import ApiModel


class JoinIn(ApiModel):
    email: Email
    adult: bool = Field(description="The person confirms they are 18 or over.")
    privacy: str = Field(max_length=32, description="The privacy notice version shown with the form.")


class TokenIn(ApiModel):
    token: str = Field(min_length=16, max_length=128, description="The token from the emailed link.")
