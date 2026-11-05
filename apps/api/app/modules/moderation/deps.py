"""Staff authorization for /v1/admin/* (T15). The API is the authority; the
admin console (stage 14) only improves the experience.

Until stage 14, staff use their ordinary session. Before any deployment,
/v1/admin must require separate staff sessions with two-factor
authentication (architecture; release blocker in progress.md).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.errors import ApiError
from app.modules.accounts.models import UserRole
from app.modules.auth.deps import Authenticated, CurrentSession

STAFF = {UserRole.moderator, UserRole.admin}


async def staff_session(auth: CurrentSession) -> Authenticated:
    if auth.user.role not in STAFF:
        raise ApiError(403, "staff_only", "This needs a staff account.")
    return auth


async def admin_session(auth: Annotated[Authenticated, Depends(staff_session)]) -> Authenticated:
    if auth.user.role is not UserRole.admin:
        raise ApiError(403, "admin_only", "Only an admin can do that.")
    return auth


StaffSession = Annotated[Authenticated, Depends(staff_session)]
AdminSession = Annotated[Authenticated, Depends(admin_session)]
