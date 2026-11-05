"""Billing jobs, registered under the `billing` namespace (D094)."""

from __future__ import annotations

import procrastinate

from app.jobs import worker_context
from app.providers.payments import PaymentsUnavailableError

blueprint = procrastinate.Blueprint()
RETRY = procrastinate.RetryStrategy(max_attempts=8, exponential_wait=60, retry_exceptions={PaymentsUnavailableError})


@blueprint.task(name="cancel_for_deletion", retry=RETRY)
async def cancel_for_deletion(subscription_id: str) -> None:
    """Someone asked to delete their account: stop charging them now."""
    await worker_context().payments.cancel(subscription_id, at_cycle_end=False)
