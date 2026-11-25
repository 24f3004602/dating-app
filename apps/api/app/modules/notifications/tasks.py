"""Notification jobs, registered under the `notify` namespace (D093)."""

from __future__ import annotations

import uuid

import procrastinate

from app.jobs import worker_context
from app.modules.notifications import service
from app.providers.push import PushUnavailableError

blueprint = procrastinate.Blueprint()
# Network errors, 429 and 5xx from the push service are retried with backoff (Expo's guidance).
RETRY = procrastinate.RetryStrategy(max_attempts=5, exponential_wait=30, retry_exceptions={PushUnavailableError})


@blueprint.task(name="send", retry=RETRY)
async def send(user_id: str, kind: str) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.send_push(
            session, ctx.push, ctx.settings.brand_name,
            user_id=uuid.UUID(user_id), kind=service.Kind(kind), now=ctx.clock(),
        )  # fmt: skip


NOTICES_CRON = "30 3 * * *"  # daily, 09:00 in India (UTC here, as procrastinate reads it)


@blueprint.periodic(cron=NOTICES_CRON)
@blueprint.task(
    name="document_and_rule_notices",
    retry=procrastinate.RetryStrategy(max_attempts=3, exponential_wait=60),
    queueing_lock="notify:document_and_rule_notices",
)
async def document_and_rule_notices(timestamp: int) -> None:
    """New versions of the documents, and the rules every three months (D159)."""
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.send_document_and_rule_notices(session, ctx.settings, ctx.clock())


@blueprint.periodic(cron="*/15 * * * *")
@blueprint.task(name="check_receipts", retry=RETRY, queueing_lock="notify:check_receipts")
async def check_receipts(timestamp: int) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.check_receipts(session, ctx.push, ctx.clock())
