"""Media jobs. Registered under the `media` namespace (`media:delete_objects`)."""

from __future__ import annotations

import procrastinate

from app.jobs import worker_context
from app.modules.media import service

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=8, exponential_wait=10)


@blueprint.task(name="delete_objects", retry=RETRY)
async def delete_objects(keys: list[str]) -> None:
    await service.delete_objects(worker_context().storage, keys)
