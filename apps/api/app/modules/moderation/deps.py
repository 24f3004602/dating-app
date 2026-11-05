"""Staff authorization for /v1/admin/* (T15). The API is the authority; the
admin console (stage 14) only improves the experience.

Every route needs a staff session (`web_admin`), which only two-factor
sign-in opens (D090); an ordinary app session gets 401 here, even a staff
member's. The role is checked on every request, so a demotion takes effect
at once.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.errors import ApiError
from app.modules.accounts.models import UserRole
from app.modules.auth.deps import Authenticated, CurrentStaffSession

STAFF = {UserRole.moderator, UserRole.admin}


async def staff_session(auth: CurrentStaffSession) -> Authenticated:
    if auth.user.role not in STAFF:
        raise ApiError(403, "staff_only", "This needs a staff account.")
    return auth


async def admin_session(auth: Annotated[Authenticated, Depends(staff_session)]) -> Authenticated:
    if auth.user.role is not UserRole.admin:
        raise ApiError(403, "admin_only", "Only an admin can do that.")
    return auth


StaffSession = Annotated[Authenticated, Depends(staff_session)]
AdminSession = Annotated[Authenticated, Depends(admin_session)]
