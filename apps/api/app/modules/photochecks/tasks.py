"""Photo check jobs, registered under the `photochecks` namespace (D164)."""

from __future__ import annotations

import procrastinate

from app.jobs import JobQueue, get_job_app, worker_context
from app.modules.photochecks import service

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=3, exponential_wait=60)

EXPIRE_CRON = "47 * * * *"  # hourly


@blueprint.periodic(cron=EXPIRE_CRON)
@blueprint.task(name="expire", retry=RETRY, queueing_lock="photochecks:expire")
async def expire(timestamp: int) -> None:
    """Gestures not used in time, and selfies nobody decided (deleted)."""
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.expire(session, JobQueue(get_job_app()), ctx.clock())
