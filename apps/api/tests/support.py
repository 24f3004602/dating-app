"""Helpers shared by the auth tests."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.modules.auth import service
from app.modules.auth.models import CodePurpose
from app.modules.billing import service as billing
from app.modules.media import service as media_service
from app.modules.notifications import service as notify
from app.modules.waitlist import service as waitlist
from app.providers.email import EmailMessage, MemoryEmailSender
from app.providers.payments import FakePayments
from app.providers.push import MemoryPushSender
from app.providers.storage import ObjectStorage

# APP_TIMEZONE; the tests run with the default.
APP_TZ = ZoneInfo("Asia/Kolkata")

# Long, unusual, and not in the blocklist (checked by test_passwords).
PASSWORD = "violet harbour lantern seventy"
OTHER_PASSWORD = "copper meadow kettle ninety"


class FrozenClock:
    def __init__(self, now: datetime | None = None) -> None:
        self.now = now or datetime.now(UTC).replace(microsecond=0)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


class JobRunner:
    """Runs queued jobs inside the test transaction, like the worker would.

    The real worker path (procrastinate fetching and running jobs) is covered
    separately in test_jobs.py against a committed scratch database.
    """

    def __init__(
        self,
        db: async_sessionmaker[AsyncSession],
        settings: Settings,
        clock: FrozenClock,
        storage: ObjectStorage | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.clock = clock
        self.storage = storage
        self.mail = MemoryEmailSender()
        self.push = MemoryPushSender()
        self.payments = FakePayments()
        self.codes: list[str] = []
        self.waitlist_tokens: list[str] = []

    async def pending(self) -> list[tuple[int, str, dict[str, Any]]]:
        async with self.db() as s:
            rows = (
                await s.execute(
                    text("SELECT id, task_name, args FROM procrastinate_jobs WHERE status = 'todo' ORDER BY id")
                )
            ).all()
        return [(int(r[0]), str(r[1]), dict(r[2])) for r in rows]

    async def run(self) -> int:
        jobs = await self.pending()
        for job_id, name, args in jobs:
            async with self.db() as s:
                if name == service.ISSUE_CODE:
                    code = await service.issue_code(
                        s,
                        self.settings,
                        self.mail,
                        now=self.clock(),
                        user_id=uuid.UUID(args["user_id"]),
                        purpose=CodePurpose(args["purpose"]),
                    )
                    if code:
                        self.codes.append(code)
                elif name == media_service.DELETE_OBJECTS:
                    assert self.storage is not None
                    await media_service.delete_objects(self.storage, list(args["keys"]))
                elif name == billing.CANCEL_FOR_DELETION:
                    await self.payments.cancel(str(args["subscription_id"]), at_cycle_end=False)
                elif name == notify.SEND_PUSH:
                    await notify.send_push(
                        s, self.push, self.settings.brand_name,
                        user_id=uuid.UUID(args["user_id"]), kind=notify.Kind(args["kind"]), now=self.clock(),
                    )  # fmt: skip
                elif name == waitlist.SEND_CONFIRMATION:
                    token = await waitlist.send_confirmation(
                        s, self.settings, self.mail, now=self.clock(), entry_id=uuid.UUID(args["entry_id"])
                    )
                    if token:
                        self.waitlist_tokens.append(token)
                elif name == service.SEND_NOTICE:
                    await service.send_notice(
                        s, self.settings, self.mail, uuid.UUID(args["user_id"]), service.Notice(args["kind"])
                    )
                else:
                    raise AssertionError(f"unexpected job {name}")
            async with self.db() as s:
                await s.execute(text("DELETE FROM procrastinate_jobs WHERE id = :id"), {"id": job_id})
                await s.commit()
        return len(jobs)

    @property
    def last_code(self) -> str:
        assert self.codes, "no code was issued"
        return self.codes[-1]

    def mail_to(self, email: str) -> list[EmailMessage]:
        return [m for m in self.mail.outbox if m.to == email]


def birthdate_for_age(clock: FrozenClock, years: int, *, days_extra: int = 0) -> date:
    # The age gate counts on the India date (D049), which is a day ahead of
    # UTC from 18:30 UTC: using the UTC date here failed every evening.
    today = clock().astimezone(APP_TZ).date()
    try:
        born = today.replace(year=today.year - years)
    except ValueError:  # 29 February
        born = today.replace(year=today.year - years, day=28)
    return born - timedelta(days=days_extra)


def consents(settings: Settings) -> dict[str, str]:
    return {"terms": settings.terms_version, "privacy": settings.privacy_version}


async def register(
    client: AsyncClient,
    settings: Settings,
    clock: FrozenClock,
    email: str,
    password: str = PASSWORD,
    *,
    birthdate: date | None = None,
    **extra: Any,
) -> Response:
    body = {
        "email": email,
        "password": password,
        "birthdate": (birthdate or birthdate_for_age(clock, 27)).isoformat(),
        "consents": consents(settings),
        **extra,
    }
    return await client.post("/v1/auth/register", json=body)


async def signup(client: AsyncClient, jobs: JobRunner, email: str, password: str = PASSWORD) -> dict[str, Any]:
    """Register, run the code job, verify. Returns the session response body."""
    r = await register(client, jobs.settings, jobs.clock, email, password)
    assert r.status_code == 202, r.text
    await jobs.run()
    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": jobs.last_code, "password": password})
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


def without_request_id(r: Response) -> tuple[int, dict[str, Any], str]:
    body = dict(r.json())
    body.pop("request_id", None)
    return r.status_code, body, r.headers.get("content-type", "")
