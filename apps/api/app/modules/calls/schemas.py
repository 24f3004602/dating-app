"""Request and response models for Live (stage 23, D123)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.modules.calls.models import CallEndReason, CallState
from app.schemas import ApiModel

# Session descriptions keep their line breaks: the last line needs its CRLF to be read.
Sdp = Annotated[str, StringConstraints(strip_whitespace=False)]

# What stands between a member and a call, if anything (`LiveOut.ready`).
Readiness = Literal[
    "ok", "unavailable", "rules", "profile_incomplete", "paused", "on_hold", "no_calls_left", "daily_limit"
]


class CallPeer(ApiModel):
    """All a stranger sees of you in a call, besides your video: first name and age."""

    user_id: uuid.UUID
    display_name: str
    age: int


class CallOut(ApiModel):
    id: uuid.UUID
    role: Literal["offerer", "answerer"]
    client_id: str = Field(description="The device of yours that takes this call")
    state: CallState
    peer: CallPeer | None = Field(description="None if they have left")
    limit_s: int = Field(description="The longest the call may run once connected")
    free: bool = Field(description="This is one of your free calls")
    offer_sdp: Sdp | None = Field(description="For the answerer, once the offer is in")
    answer_sdp: Sdp | None = Field(description="For the offerer, once the answer is in")
    connected_at: datetime | None
    ends_at: datetime | None = Field(description="When the call's time runs out (set once connected)")
    ended_at: datetime | None
    end_reason: CallEndReason | None
    server_now: datetime = Field(description="The server's clock, to show the time left correctly")


class LiveOut(ApiModel):
    """Live at a glance, for its screen."""

    available: bool = Field(description="Calls are set up on this server")
    ready: Readiness
    rules_version: str
    rules_accepted: bool
    free_calls: int
    free_calls_left: int
    free_call_seconds: int
    plan: bool = Field(description="The plan is active: calls aren't counted")
    plan_call_seconds: int
    waiting: bool
    call: CallOut | None = Field(description="An open call, on this device or another")
    lgbtq_labels: bool = Field(description="Your profile has an LGBTQ+ label, so you can choose lgbtq_only (D161)")
    lgbtq_only: bool = Field(
        description="In Live's LGBTQ+ space: paired only with members who chose it too (while you have a label)"
    )


class RulesIn(ApiModel):
    version: str = Field(max_length=16)


class LiveSettingsIn(ApiModel):
    lgbtq_only: bool = Field(description="Join Live's LGBTQ+ space: be paired only with others in it (D161)")


class QueueIn(ApiModel):
    client_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,36}$", description="A random ID for this device or tab")


class QueueOut(ApiModel):
    state: Literal["waiting", "paired"]
    call: CallOut | None
    retry_after_s: int = Field(description="When to send the next heartbeat while waiting")


class SdpIn(ApiModel):
    sdp: Sdp = Field(min_length=10, max_length=20_000)


class EndIn(ApiModel):
    reason: Literal["hangup", "next", "failed", "report", "limit"]


class IceServerOut(ApiModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None


class IceOut(ApiModel):
    """For the device's peer connection: `relay` means `iceTransportPolicy: "relay"`."""

    policy: Literal["relay", "all"]
    servers: list[IceServerOut]
    ttl_s: int
