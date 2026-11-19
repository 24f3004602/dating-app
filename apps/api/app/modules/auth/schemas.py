"""Request and response models for /v1/auth and /v1/me."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, EmailStr, Field, StringConstraints, TypeAdapter, ValidationError, model_validator

from app.schemas import ApiModel


def _lower(v: str) -> str:
    return v.lower()


# Normalised: email-validator's checks, then the whole address lowercased.
Email = Annotated[EmailStr, Field(max_length=254), AfterValidator(_lower)]
_EMAIL: TypeAdapter[str] = TypeAdapter(Email)


def normalize_email(raw: str) -> str:
    """The API's normalisation, for command-line tools (the invite list)."""
    try:
        return _EMAIL.validate_python(raw.strip())
    except ValidationError:
        raise ValueError("not a valid email address") from None


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
    # False for an account made with Google that never set a password (D134): it signs
    # in with Google, and sets a password through "Forgot your password?" when it needs one.
    has_password: bool = True


class SessionOut(ApiModel):
    token: str = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - the RFC 6750 scheme name
    expires_at: datetime
    user: MeOut


# --- Sign in with Google (D134) ------------------------------------------------------


class GoogleConfigOut(ApiModel):
    """Whether Google sign-in is on, and what the apps need to start it (all public)."""

    enabled: bool
    client_id: str | None
    # Where Google sends the web app back; null where only the phone app can use it.
    redirect_uri: str | None


class GoogleProofIn(ApiModel):
    """Google's answer: the phone app's ID token, or the web app's code with its PKCE verifier."""

    id_token: str | None = Field(default=None, min_length=20, max_length=4096, repr=False)
    code: str | None = Field(default=None, min_length=10, max_length=512, repr=False)
    code_verifier: str | None = Field(default=None, pattern=r"^[A-Za-z0-9._~-]{43,128}$", repr=False)

    @model_validator(mode="after")
    def _one_way(self) -> Self:
        by_token = self.id_token is not None
        by_code = self.code is not None and self.code_verifier is not None
        if by_token == by_code or (self.code is None) != (self.code_verifier is None):
            raise ValueError("send either id_token, or code with code_verifier")
        return self


class GoogleSignInIn(GoogleProofIn):
    # As on sign-in: keep an account that is waiting to be deleted (D083).
    restore: bool = False


class GoogleSignInOut(ApiModel):
    """Signed in (`session`), or someone new: `ticket` finishes the account with a date of
    birth and the documents, as any sign-up does (the age gate, D016)."""

    session: SessionOut | None = None
    ticket: str | None = Field(default=None, repr=False)
    email: str | None = None
    name: str | None = None


class GoogleCompleteIn(ApiModel):
    ticket: str = Field(min_length=20, max_length=1024, repr=False)
    birthdate: date
    consents: ConsentsIn
