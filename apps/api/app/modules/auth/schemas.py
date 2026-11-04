"""Request and response models for /v1/auth and /v1/me."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, EmailStr, Field, StringConstraints

from app.schemas import ApiModel


def _lower(v: str) -> str:
    return v.lower()


# Normalised: email-validator's checks, then the whole address lowercased.
Email = Annotated[EmailStr, Field(max_length=254), AfterValidator(_lower)]
# Never stripped (spaces are valid password characters), never in reprs.
# Length and quality rules are applied by the service (passwords.py).
Password = Annotated[str, StringConstraints(strip_whitespace=False, min_length=1, max_length=1024), Field(repr=False)]
Code = Annotated[str, StringConstraints(pattern=r"^\d{6}$"), Field(repr=False)]


class ConsentsIn(ApiModel):
    terms: str = Field(max_length=32, description="Version of the terms the member accepted")
    privacy: str = Field(max_length=32, description="Version of the privacy notice the member accepted")


class RegisterIn(ApiModel):
    email: Email
    password: Password
    birthdate: date
    consents: ConsentsIn


class VerifyEmailIn(ApiModel):
    email: Email
    code: Code
    # The password chosen at sign-up: binds verification to the person who
    # set it, which defeats account pre-hijacking (D045).
    password: Password


class EmailIn(ApiModel):
    email: Email


class LoginIn(ApiModel):
    email: Email
    password: Password


class PasswordResetConfirmIn(ApiModel):
    email: Email
    code: Code
    new_password: Password


class Accepted(ApiModel):
    """Returned whether or not an account exists (no enumeration, T04)."""

    status: Literal["accepted"] = "accepted"


class Verification(ApiModel):
    # "declared" is the only possible age value: an age gate is not verification (D016).
    age: Literal["declared"]
    email: Literal["verified", "unverified"]
    identity: Literal["not_checked", "verified", "failed"]


class MeOut(ApiModel):
    id: uuid.UUID
    email: str
    birthdate: date
    age: int
    status: str
    role: str
    verification: Verification
    created_at: datetime


class SessionOut(ApiModel):
    token: str = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - the RFC 6750 scheme name
    expires_at: datetime
    user: MeOut
