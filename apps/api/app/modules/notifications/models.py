"""Notifications (stage 16, D093).

- `push_devices`: one per session. The row goes with its session (CASCADE),
  and pushes go only to devices whose session is still live, so signing out,
  signing out everywhere, a password reset, a ban or a deletion request stop
  pushes at once. A token moves to the newest session that registers it.
- `notification_prefs`: categories a member wants pushed (all on by default).
- `member_notices`: messages from the team, shown in the app whether or not
  push works: moderation warnings, and (stage 28f, D159) new versions of the
  terms and privacy notice and the reminder of the rules India's IT Rules ask
  for every three months. Fixed wording per kind, so no free text reaches the
  member; a `new_documents` notice names the version it announces.
- `push_tickets`: Expo receipt IDs waiting to be checked (at most a day).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, CreatedAtMixin


def _enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        cls, native_enum=False, create_constraint=True, length=16, name=name,
        values_callable=lambda e: [m.value for m in e],
    )  # fmt: skip


class Platform(enum.StrEnum):
    ios = "ios"
    android = "android"


class NoticeKind(enum.StrEnum):
    warning = "warning"
    new_documents = "new_documents"  # the terms and privacy notice have a new version (D159)
    rules_reminder = "rules_reminder"  # IT Rules, rule 3(1)(c): at least every three months (D159)


class PushDevice(CreatedAtMixin, Base):
    __tablename__ = "push_devices"
    __table_args__ = (CheckConstraint("char_length(token) BETWEEN 20 AND 255", name="token_length"),)

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True)
    platform: Mapped[Platform] = mapped_column(_enum(Platform, "platform"))
    last_seen_at: Mapped[datetime]


class NotificationPrefs(Base):
    __tablename__ = "notification_prefs"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    matches: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    messages: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    likes: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    updated_at: Mapped[datetime]


class MemberNotice(CreatedAtMixin, Base):
    __tablename__ = "member_notices"
    # A notice of new documents names the version it announces, so each version is told once.
    __table_args__ = (CheckConstraint("(kind = 'new_documents') = (version IS NOT NULL)", name="version_documents"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[NoticeKind] = mapped_column(_enum(NoticeKind, "kind"))
    version: Mapped[str | None] = mapped_column(String(32))
    read_at: Mapped[datetime | None]


class PushTicket(CreatedAtMixin, Base):
    __tablename__ = "push_tickets"
    __table_args__ = (Index("ix_push_tickets_created_at", "created_at"),)

    receipt_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    token: Mapped[str] = mapped_column(String(255), index=True)
