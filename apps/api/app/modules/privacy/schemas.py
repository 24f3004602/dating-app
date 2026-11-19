"""Request and response models for account deletion."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import Field, model_validator

from app.modules.auth.schemas import GoogleProofIn
from app.schemas import ApiModel


class DeletionIn(ApiModel):
    # Asked again, so a phone left signed in can't be used to delete the account: the
    # password, or for an account that signs in with Google (and may have no password,
    # D134) Google's answer again, for the same Google account and given just now.
    password: str | None = Field(default=None, min_length=1, max_length=1024, repr=False)
    google: GoogleProofIn | None = None

    @model_validator(mode="after")
    def _one_way(self) -> Self:
        if (self.password is None) == (self.google is None):
            raise ValueError("send the password, or Google's answer")
        return self


class DeletionOut(ApiModel):
    """Everything is deleted after `purge_after` (later only while a safety
    report about the account is open, at most 30 days). Signing in before
    then can keep the account."""

    purge_after: datetime
