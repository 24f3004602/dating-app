"""Request and response models for staff sign-in (/v1/admin/auth) and enrolment."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.modules.auth.schemas import Email, Password
from app.schemas import ApiModel

Secret = Annotated[str, StringConstraints(min_length=16, max_length=128), Field(repr=False)]
# A 6-digit authenticator code, or a recovery code like `k7mq-x2pd-a9hs`.
SecondFactor = Annotated[str, StringConstraints(strip_whitespace=True, min_length=6, max_length=32), Field(repr=False)]


class StaffLoginIn(ApiModel):
    email: Email
    password: Password


class ChallengeOut(ApiModel):
    """The password was right; the second step is next."""

    challenge: str = Field(repr=False)
    expires_at: datetime
    # "verify": enter a code from the authenticator app (or a recovery code).
    # "enroll": no authenticator yet; an enrolment token from an admin is needed.
    next: Literal["verify", "enroll"]


class EnrollIn(ApiModel):
    challenge: Secret
    enrollment_token: Secret


class EnrollOut(ApiModel):
    """Add this to an authenticator app, then confirm with a code from it."""

    secret: str = Field(repr=False)
    otpauth_uri: str = Field(repr=False)


class VerifyIn(ApiModel):
    challenge: Secret
    code: SecondFactor


class StaffMe(ApiModel):
    id: uuid.UUID
    email: str
    role: Literal["moderator", "admin"]
    recovery_codes_left: int


class StaffSessionOut(ApiModel):
    token: str = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - the RFC 6750 scheme name
    expires_at: datetime
    idle_timeout_s: int
    staff: StaffMe
    # Shown once, right after enrolment: ten single-use codes for a lost phone.
    recovery_codes: list[str] | None = Field(default=None, repr=False)


class EnrollmentTokenOut(ApiModel):
    """Give this to the staff member out of band (not by email); it works once."""

    enrollment_token: str = Field(repr=False)
    expires_at: datetime
