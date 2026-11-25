"""Moderation jobs. Registered under the `moderation` namespace (`moderation:alert_urgent`)."""

from __future__ import annotations

import procrastinate

from app.jobs import worker_context
from app.modules.moderation import service

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=5, exponential_wait=10)

# Deferred by name: safety.service.ALERT_URGENT. One waits at a time (D157).


@blueprint.task(name="alert_urgent", retry=RETRY, queueing_lock="moderation:alert_urgent")
async def alert_urgent() -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.alert_urgent(session, ctx.settings, ctx.email_sender, now=ctx.clock())
