"""Command line: `datingapp-api serve | worker | seed-dev`."""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import uvicorn
from sqlalchemy import func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import create_engine, create_session_factory
from app.fixtures import PROFILES, seed_discovery_fixtures
from app.modules.accounts.models import UNUSABLE_PASSWORD, User, UserRole, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth.crypto import derive_key
from app.providers.storage import ObjectStorage, create_storage

# RFC 2606 reserves `.invalid`: these addresses can never receive mail.
FIXTURE_EMAIL_DOMAIN = "fixture.invalid"


@dataclass(frozen=True)
class Fixture:
    handle: str
    role: UserRole
    status: UserStatus
    birthdate: date

    @property
    def email(self) -> str:
        return f"{self.handle}@{FIXTURE_EMAIL_DOMAIN}"


# Development fixtures only. Every one is labelled by its handle and its
# undeliverable domain, and none can log in (unusable password).
FIXTURES: tuple[Fixture, ...] = (
    Fixture("fixture-member-01", UserRole.member, UserStatus.active, date(1996, 5, 14)),
    Fixture("fixture-member-02", UserRole.member, UserStatus.active, date(1999, 11, 2)),
    Fixture("fixture-member-03", UserRole.member, UserStatus.pending, date(2001, 1, 20)),
    Fixture("fixture-member-04", UserRole.member, UserStatus.suspended, date(1993, 8, 30)),
    Fixture("fixture-moderator-01", UserRole.moderator, UserStatus.active, date(1990, 3, 3)),
    Fixture("fixture-admin-01", UserRole.admin, UserStatus.active, date(1988, 12, 12)),
)


class SeedRefusedError(RuntimeError):
    pass


async def seed_dev(session: AsyncSession, settings: Settings, storage: ObjectStorage) -> int:
    """Create the labelled fixtures. Idempotent. Returns how many accounts were new."""
    if settings.is_production:
        raise SeedRefusedError("refusing to seed fixtures in production")
    now = datetime.now(UTC)
    created = 0
    for f in FIXTURES:
        stmt = (
            pg_insert(User)
            .values(
                email_normalized=f.email,
                password_hash=UNUSABLE_PASSWORD,
                birthdate=f.birthdate,
                status=f.status,
                role=f.role,
                email_verified_at=now if f.status is not UserStatus.pending else None,
            )
            .on_conflict_do_nothing(index_elements=[User.email_normalized])
            .returning(User.id)
        )
        if (await session.execute(stmt)).scalar_one_or_none() is not None:
            created += 1
    created += await seed_discovery_fixtures(session, storage, now)
    await session.execute(
        insert(AuditLog).values(
            action="dev.seed", details={"created": created, "fixtures": len(FIXTURES) + len(PROFILES)}
        )
    )
    await session.commit()
    return created


async def count_fixtures(session: AsyncSession) -> int:
    stmt = select(func.count()).select_from(User).where(User.email_normalized.like(f"%@{FIXTURE_EMAIL_DOMAIN}"))
    return int((await session.execute(stmt)).scalar_one())


def run_async[T](factory: Callable[[], Coroutine[Any, Any, T]]) -> T:
    # psycopg's async mode cannot use Windows' default Proactor loop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    return asyncio.run(factory(), loop_factory=loop_factory)


def _seed_command(_: argparse.Namespace) -> int:
    settings = get_settings()

    async def go() -> int:
        engine = create_engine(settings)
        storage = create_storage(settings, derive_key(settings.app_secret_key.get_secret_value(), "media-url"))
        try:
            async with create_session_factory(engine)() as session:
                return await seed_dev(session, settings, storage)
        finally:
            await engine.dispose()

    try:
        created = run_async(go)
    except SeedRefusedError as exc:
        print(f"seed-dev: {exc}", file=sys.stderr)
        return 2
    total = len(FIXTURES) + len(PROFILES)
    print(f"seed-dev: {created} new fixture account(s); {total} defined (all @{FIXTURE_EMAIL_DOMAIN}).")
    return 0


def _staff_enrollment_command(args: argparse.Namespace) -> int:
    """Bootstrap or recovery: an enrolment token for a staff account, printed once
    to whoever runs this on the server (D090). It resets that person's authenticator."""
    from sqlalchemy import select  # noqa: PLC0415 - command-only imports

    from app.clock import system_clock  # noqa: PLC0415
    from app.errors import ApiError  # noqa: PLC0415
    from app.modules.staff.service import issue_enrollment  # noqa: PLC0415

    settings = get_settings()
    email = str(args.email).strip().lower()

    async def go() -> tuple[str, datetime] | None:
        engine = create_engine(settings)
        try:
            async with create_session_factory(engine)() as session:
                found = await session.execute(select(User.id).where(User.email_normalized == email))
                user_id = found.scalar_one_or_none()
                if user_id is None:
                    return None
                return await issue_enrollment(session, settings, None, user_id, system_clock())
        finally:
            await engine.dispose()

    try:
        issued = run_async(go)
    except ApiError as exc:
        print(f"staff-enrollment: refused ({exc.code})", file=sys.stderr)
        return 2
    if issued is None:
        print("staff-enrollment: no account with that email", file=sys.stderr)
        return 2
    token, expires = issued
    print(f"staff-enrollment: one-time token (valid until {expires.isoformat()}); give it to them in person:")
    print(token)
    return 0


def _worker_command(_: argparse.Namespace) -> int:
    from app.clock import system_clock  # noqa: PLC0415 - worker-only imports
    from app.jobs import WorkerContext, get_job_app, open_worker_pool, set_worker_context  # noqa: PLC0415
    from app.logs import configure_logging  # noqa: PLC0415
    from app.modules.auth.crypto import derive_key  # noqa: PLC0415
    from app.providers.email import create_email_sender  # noqa: PLC0415
    from app.providers.push import create_push_sender  # noqa: PLC0415
    from app.providers.storage import create_storage  # noqa: PLC0415

    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)

    async def go() -> None:
        engine = create_engine(settings)
        set_worker_context(
            WorkerContext(
                settings=settings,
                session_factory=create_session_factory(engine),
                email_sender=create_email_sender(settings),
                clock=system_clock,
                storage=create_storage(settings, derive_key(settings.app_secret_key.get_secret_value(), "media-url")),
                push=create_push_sender(settings),
            )
        )
        job_app = get_job_app()
        pool = await open_worker_pool(settings)
        try:
            async with job_app.open_async(pool=pool):
                # Signal handlers need loop.add_signal_handler, which Windows lacks.
                await job_app.run_worker_async(
                    install_signal_handlers=sys.platform != "win32", delete_jobs="successful"
                )
        finally:
            set_worker_context(None)
            await pool.close()
            await engine.dispose()

    run_async(go)
    return 0


def server_config(app: Any, *, host: str, port: int, **kw: Any) -> uvicorn.Config:
    """The uvicorn settings the API runs with (the tests use them too)."""
    return uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=False,  # our middleware writes a privacy-safe access log
        log_config=None,  # keep our logging configuration
        proxy_headers=False,
        # Realtime (D074): clients only ever send tiny frames; hints are tiny
        # too, so compression buys nothing. Protocol pings drop dead clients.
        ws="websockets-sansio",
        ws_max_size=4096,
        ws_per_message_deflate=False,
        ws_ping_interval=20.0,
        ws_ping_timeout=20.0,
        **kw,
    )


def _serve_command(args: argparse.Namespace) -> int:
    config = server_config("app.main:create_app", host=args.host, port=args.port, factory=True)
    run_async(uvicorn.Server(config).serve)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="datingapp-api")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="run the API (development)")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.set_defaults(func=_serve_command)
    worker = sub.add_parser("worker", help="run the background job worker")
    worker.set_defaults(func=_worker_command)
    seed = sub.add_parser("seed-dev", help="create labelled development fixtures")
    seed.set_defaults(func=_seed_command)
    enrol = sub.add_parser("staff-enrollment", help="issue a one-time authenticator enrolment token (staff)")
    enrol.add_argument("email")
    enrol.set_defaults(func=_staff_enrollment_command)
    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
