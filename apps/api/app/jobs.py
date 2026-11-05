"""Background jobs on procrastinate (D035).

- Deferral is transactional: the job row is inserted on the request's own
  database connection, so it commits or rolls back with the data change.
- Job arguments hold only IDs and kinds, never emails or codes: the worker
  looks everything else up (privacy inventory).
- The worker runs from the same code: `datingapp-api worker`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import procrastinate
from psycopg_pool import AsyncConnectionPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clock import Clock
from app.config import Settings
from app.providers.email import EmailSender
from app.providers.push import NoPushSender, PushSender
from app.providers.storage import ObjectStorage


def libpq_url(sqlalchemy_url: str) -> str:
    return sqlalchemy_url.replace("postgresql+psycopg://", "postgresql://", 1)


_job_app: procrastinate.App | None = None


def get_job_app() -> procrastinate.App:
    """The process-wide procrastinate app.

    procrastinate expects one App per process: registering a blueprint renames
    its tasks in place, so a second App would see `auth:auth:issue_code`
    (found by the worker end-to-end test). Deferral passes the request's own
    connection, and the worker opens the app with its own pool
    (`open_worker_pool`), so the app itself holds no connection settings.
    """
    global _job_app  # noqa: PLW0603 - one app per process, by design
    if _job_app is None:
        from app.modules.auth.tasks import blueprint as auth_tasks  # noqa: PLC0415 - tasks import this module
        from app.modules.media.tasks import blueprint as media_tasks  # noqa: PLC0415
        from app.modules.notifications.tasks import blueprint as notify_tasks  # noqa: PLC0415
        from app.modules.privacy.tasks import blueprint as privacy_tasks  # noqa: PLC0415

        app = procrastinate.App(connector=procrastinate.PsycopgConnector())
        app.add_tasks_from(auth_tasks, namespace="auth")
        app.add_tasks_from(media_tasks, namespace="media")
        app.add_tasks_from(notify_tasks, namespace="notify")
        app.add_tasks_from(privacy_tasks, namespace="privacy")
        _job_app = app
    return _job_app


async def open_worker_pool(settings: Settings) -> AsyncConnectionPool:
    pool = AsyncConnectionPool(libpq_url(settings.database_url.get_secret_value()), min_size=1, max_size=4, open=False)
    await pool.open(wait=True, timeout=settings.db_connect_timeout_s * 3)
    return pool


class JobQueue:
    def __init__(self, app: procrastinate.App) -> None:
        self.app = app

    async def defer(self, session: AsyncSession, task: str, **kwargs: Any) -> int:
        """Insert a job inside the session's current transaction."""
        connection = await session.connection()
        raw = await connection.get_raw_connection()
        job_id: int = await self.app.configure_task(task, connection=raw.driver_connection).defer_async(**kwargs)
        return job_id


@dataclass(frozen=True)
class WorkerContext:
    settings: Settings
    session_factory: async_sessionmaker[AsyncSession]
    email_sender: EmailSender
    clock: Clock
    storage: ObjectStorage
    push: PushSender = field(default_factory=NoPushSender)


_context: WorkerContext | None = None


def set_worker_context(context: WorkerContext | None) -> None:
    global _context  # noqa: PLW0603 - one context per worker process
    _context = context


def worker_context() -> WorkerContext:
    if _context is None:
        raise RuntimeError("worker context is not configured")
    return _context
