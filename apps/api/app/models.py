"""Import every model so `Base.metadata` is complete (Alembic, tests)."""

from app.db import Base
from app.modules.accounts.models import Consent, User
from app.modules.audit.models import AuditLog
from app.modules.auth.models import OneTimeCode, Session
from app.modules.discovery.models import Block, DailyPick, Interaction, Match, Preferences
from app.modules.media.models import Photo
from app.modules.messaging.models import MatchRead, Message
from app.modules.profiles.models import Area, Profile, ProfilePrompt
from app.modules.safety.models import ModerationAction, Report

__all__ = [
    "Area",
    "AuditLog",
    "Base",
    "Block",
    "Consent",
    "DailyPick",
    "Interaction",
    "Match",
    "MatchRead",
    "Message",
    "ModerationAction",
    "OneTimeCode",
    "Photo",
    "Preferences",
    "Profile",
    "ProfilePrompt",
    "Report",
    "Session",
    "User",
]
