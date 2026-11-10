"""Waitlist jobs. Registered under the `waitlist` namespace (`waitlist:send_confirmation`)."""

from __future__ import annotations

import uuid

import procrastinate

from app.jobs import worker_context
from app.modules.waitlist import service

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=5, exponential_wait=10)


@blueprint.task(name="send_confirmation", retry=RETRY)
async def send_confirmation(entry_id: str) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.send_confirmation(
            session, ctx.settings, ctx.email_sender, now=ctx.clock(), entry_id=uuid.UUID(entry_id)
        )
