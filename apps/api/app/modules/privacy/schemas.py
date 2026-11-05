"""Request and response models for account deletion."""

from __future__ import annotations

from datetime import datetime

from app.modules.auth.schemas import Password
from app.schemas import ApiModel


class DeletionIn(ApiModel):
    # Asked again, so a phone left signed in can't be used to delete the account.
    password: Password


class DeletionOut(ApiModel):
    """Everything is deleted after `purge_after` (later only while a safety
    report about the account is open, at most 30 days). Signing in before
    then can keep the account."""

    purge_after: datetime
