"""Auth jobs. Registered under the `auth` namespace (`auth:issue_code`)."""

from __future__ import annotations

import uuid

import procrastinate

from app.jobs import worker_context
from app.modules.auth import service
from app.modules.auth.models import CodePurpose

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=5, exponential_wait=10)

# Deferred by name: service.ISSUE_CODE and service.SEND_NOTICE.


@blueprint.task(name="issue_code", retry=RETRY)
async def issue_code(user_id: str, purpose: str) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.issue_code(
            session,
            ctx.settings,
            ctx.email_sender,
            now=ctx.clock(),
            user_id=uuid.UUID(user_id),
            purpose=CodePurpose(purpose),
        )


@blueprint.task(name="send_notice", retry=RETRY)
async def send_notice(user_id: str, kind: str) -> None:
    ctx = worker_context()
    async with ctx.session_factory() as session:
        await service.send_notice(session, ctx.settings, ctx.email_sender, uuid.UUID(user_id), service.Notice(kind))
