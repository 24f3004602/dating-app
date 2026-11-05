"""Privacy jobs, registered under the `privacy` namespace (D085).

Periodic: procrastinate's worker defers each run once per schedule tick,
even with several workers (it records each tick in the database). The cron
strings are in UTC.
"""

from __future__ import annotations

import procrastinate
from procrastinate.job_context import JobContext

from app.jobs import JobQueue, get_job_app, worker_context
from app.modules.privacy import retention, service

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=3, exponential_wait=60)

PURGE_CRON = "7 * * * *"  # hourly
SWEEP_CRON = "37 * * * *"  # hourly
OLD_JOBS_CRON = "15 21 * * *"  # daily, 02:45 in India


@blueprint.periodic(cron=PURGE_CRON)
@blueprint.task(name="purge_accounts", retry=RETRY, queueing_lock="privacy:purge_accounts")
async def purge_accounts(timestamp: int) -> None:
    ctx = worker_context()
    await service.purge_due_accounts(ctx.session_factory, ctx.settings, JobQueue(get_job_app()), ctx.clock())


@blueprint.periodic(cron=SWEEP_CRON)
@blueprint.task(name="retention_sweep", retry=RETRY, queueing_lock="privacy:retention_sweep")
async def retention_sweep(timestamp: int) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.sweep(session, ctx.settings, ctx.clock())


@blueprint.periodic(cron=OLD_JOBS_CRON)
@blueprint.task(name="remove_old_jobs", pass_context=True, queueing_lock="privacy:remove_old_jobs")
async def remove_old_jobs(context: JobContext, timestamp: int) -> None:
    """Finished, failed, cancelled and aborted job rows (IDs and kinds only) after 30 days."""
    await context.app.job_manager.delete_old_jobs(
        nb_hours=retention.FINISHED_JOB_HOURS, include_failed=True, include_cancelled=True, include_aborted=True
    )
