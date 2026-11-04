"""Import every model so `Base.metadata` is complete (Alembic, tests)."""

from app.db import Base
from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.auth.models import OneTimeCode, Session

__all__ = ["AuditLog", "Base", "OneTimeCode", "Session", "User"]
