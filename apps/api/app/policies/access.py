"""Who may see whom: the single source of visibility rules (architecture).

Every read of another member's data goes through here. Anything not allowed
is answered as "not found" (404), never "forbidden", so existence leaks
nothing (T05).

- Stage 7: a member sees their own profile and photos.
- Stage 8: and the members in today's set who are still available to them
  (no block either way, still active, visible and unpaused).
- Stage 9: and people who liked them (until they decide), and open matches
  (while neither has blocked the other). Stage 11 adds the block API; blocks
  are already enforced on every one of these paths.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.modules.discovery.service import in_todays_set
from app.modules.matching.service import liked_me, open_match_with
from app.modules.media.models import ModerationState, Photo


async def can_view_profile(
    session: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID, *, settings: Settings, now: datetime
) -> bool:
    if viewer_id == target_id:
        return True
    if await in_todays_set(session, settings, viewer_id, target_id, now):
        return True
    if await open_match_with(session, viewer_id, target_id) is not None:
        return True
    return await liked_me(session, viewer_id, target_id)


async def can_view_photo(
    session: AsyncSession, viewer_id: uuid.UUID, photo: Photo, *, settings: Settings, now: datetime
) -> bool:
    if photo.user_id == viewer_id:
        return True  # owners see their own pending and rejected photos
    if photo.moderation_state is not ModerationState.approved:
        return False
    return await can_view_profile(session, viewer_id, photo.user_id, settings=settings, now=now)
