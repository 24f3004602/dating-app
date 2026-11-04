"""Who may see whom: the single source of visibility rules (architecture).

Every read of another member's data goes through here. Anything not allowed
is answered as "not found" (404), never "forbidden", so existence leaks
nothing (T05). Stage 7 only knows the owner; the daily set, matches and
likes received (stages 8-9) and blocks (stage 11) extend these rules.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.media.models import ModerationState, Photo


async def can_view_profile(session: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID) -> bool:
    return viewer_id == target_id


async def can_view_photo(session: AsyncSession, viewer_id: uuid.UUID, photo: Photo) -> bool:
    if photo.user_id == viewer_id:
        return True  # owners see their own pending and rejected photos
    if photo.moderation_state is not ModerationState.approved:
        return False
    return await can_view_profile(session, viewer_id, photo.user_id)
