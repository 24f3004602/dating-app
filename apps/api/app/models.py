"""Import every model so `Base.metadata` is complete (Alembic, tests)."""

from app.db import Base
from app.modules.accounts.models import Consent, User
from app.modules.audit.models import AuditLog
from app.modules.auth.models import OneTimeCode, Session
from app.modules.discovery.models import Block, DailyPick, Interaction, Preferences
from app.modules.media.models import Photo
from app.modules.profiles.models import Area, Profile, ProfilePrompt

__all__ = [
    "Area",
    "AuditLog",
    "Base",
    "Block",
    "Consent",
    "DailyPick",
    "Interaction",
    "OneTimeCode",
    "Photo",
    "Preferences",
    "Profile",
    "ProfilePrompt",
    "Session",
    "User",
]
