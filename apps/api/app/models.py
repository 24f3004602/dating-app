"""Import every model so `Base.metadata` is complete (Alembic, tests)."""

from app.db import Base
from app.modules.accounts.models import Consent, User
from app.modules.audit.models import AuditLog
from app.modules.auth.models import OneTimeCode, Session

__all__ = ["AuditLog", "Base", "Consent", "OneTimeCode", "Session", "User"]
