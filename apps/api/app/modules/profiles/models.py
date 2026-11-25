from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class Gender(enum.StrEnum):
    woman = "woman"
    man = "man"
    nonbinary = "nonbinary"


class Identity(enum.StrEnum):
    """LGBTQ+ labels a member may add to their profile (stage 29a, D160): optional, up to three,
    and shown to whoever can see the profile; nothing is stored unless the member chooses to
    share it. Matching stays by gender and who a member wants to meet: a trans woman is a woman."""

    trans = "trans"
    gay = "gay"
    lesbian = "lesbian"
    bisexual = "bisexual"
    queer = "queer"
    pansexual = "pansexual"
    asexual = "asexual"
    intersex = "intersex"
    questioning = "questioning"


MAX_IDENTITIES = 3


class Intent(enum.StrEnum):
    """What a member is looking for (D050). No casual option at launch."""

    marriage = "marriage"
    long_term = "long_term"
    figuring_out = "figuring_out"


class Visibility(enum.StrEnum):
    everyone = "everyone"
    # Only people this member has liked can see them (D050).
    liked_only = "liked_only"


class Area(Base):
    """Seeded public geography: Delhi NCR's areas (migration 0004) and towns across India from
    GeoNames (D162). Coordinates never leave the server (D020)."""

    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    city: Mapped[str] = mapped_column(String(48))
    name: Mapped[str] = mapped_column(String(64))
    latitude: Mapped[Decimal] = mapped_column(Numeric(7, 4))
    longitude: Mapped[Decimal] = mapped_column(Numeric(7, 4))
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    # For ordering search results; unknown for Delhi NCR's own areas.
    population: Mapped[int | None] = mapped_column(Integer)
    # In the list shown before anyone searches (and to apps that can't search yet).
    featured: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    # Other names people search for, lowercase words: "bombay" for Mumbai.
    aliases: Mapped[str] = mapped_column(String(120), server_default=text("''"))


class Profile(CreatedAtMixin, Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("char_length(display_name) BETWEEN 1 AND 40", name="display_name_length"),
        CheckConstraint("char_length(bio) <= 500", name="bio_length"),
        CheckConstraint(
            "cardinality(interested_in) >= 1 AND interested_in <@ ARRAY['woman','man','nonbinary']::varchar[]",
            name="interested_in_valid",
        ),
        CheckConstraint(
            "cardinality(identities) <= 3 AND identities <@ ARRAY['trans','gay','lesbian','bisexual','queer',"
            "'pansexual','asexual','intersex','questioning']::varchar[]",
            name="identities_valid",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(40))
    gender: Mapped[Gender] = mapped_column(_enum(Gender, "gender"))
    interested_in: Mapped[list[str]] = mapped_column(ARRAY(String(16)))
    # The blue tick (D164): set only by our staff approving a photo check; cleared by a new photo.
    photo_verified_at: Mapped[datetime | None]
    # Optional LGBTQ+ labels, shown on the profile (D160); empty unless the member adds them.
    identities: Mapped[list[str]] = mapped_column(ARRAY(String(16)), server_default=text("'{}'"))
    intent: Mapped[Intent] = mapped_column(_enum(Intent, "intent"))
    bio: Mapped[str | None] = mapped_column(String(500))
    area_id: Mapped[str] = mapped_column(ForeignKey("areas.id", ondelete="RESTRICT"), index=True)
    # Area changes are limited to one per 24 hours (trilateration, T07).
    area_changed_at: Mapped[datetime]
    visibility: Mapped[Visibility] = mapped_column(
        _enum(Visibility, "visibility"), server_default=Visibility.everyone.value
    )
    discovery_paused: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class ProfilePrompt(Base):
    __tablename__ = "profile_prompts"
    __table_args__ = (
        UniqueConstraint("user_id", "position"),
        UniqueConstraint("user_id", "prompt_key"),
        CheckConstraint("position BETWEEN 0 AND 2", name="position_range"),
        CheckConstraint("char_length(answer) BETWEEN 1 AND 200", name="answer_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.user_id", ondelete="CASCADE"), index=True)
    prompt_key: Mapped[str] = mapped_column(String(32))
    answer: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(SmallInteger)
