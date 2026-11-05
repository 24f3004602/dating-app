"""Browser tests only: a staff account that can sign in, and something to moderate.

Creates a labelled e2e admin with the password given on the command line (the
seeded fixtures use an undeliverable domain and can never sign in), issues it
a one-time enrolment token, and files a labelled report between two seeded
fixture profiles. Prints JSON: {"email", "enrollment_token", "report_id"}.

Refuses any database whose name does not end in `_e2e_test`, and production.
Run after `seed-dev` (the e2e global setup does both).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from sqlalchemy import select
from sqlalchemy.engine import make_url

import app.models  # noqa: F401 - every table, so foreign keys resolve
from app.cli import run_async
from app.clock import system_clock
from app.config import get_settings
from app.db import create_engine, create_session_factory
from app.fixtures import PROFILES
from app.modules.accounts.models import User, UserRole, UserStatus
from app.modules.auth.passwords import Passwords
from app.modules.safety.models import Report, ReportReason, ReportStatus
from app.modules.staff.service import issue_enrollment


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    settings = get_settings()
    name = make_url(settings.database_url.get_secret_value()).database or ""
    if settings.is_production or not name.endswith("_e2e_test"):
        print(f"refusing to touch {name!r}: e2e database names end in _e2e_test", file=sys.stderr)
        return 2
    admin_email = "e2e-admin@example.com"
    reporter_email, subject_email = PROFILES[3].email, PROFILES[0].email

    async def go() -> dict[str, str]:
        engine = create_engine(settings)
        try:
            async with create_session_factory(engine)() as session:
                now = system_clock()
                session.add(
                    User(
                        email_normalized=admin_email, birthdate=date(1990, 1, 1), role=UserRole.admin,
                        status=UserStatus.active, email_verified_at=now, created_at=now, updated_at=now,
                        password_hash=Passwords(settings.password_hash_profile).hash(args.password),
                    )
                )  # fmt: skip
                await session.flush()
                ids = dict(
                    (await session.execute(
                        select(User.email_normalized, User.id).where(
                            User.email_normalized.in_([admin_email, reporter_email, subject_email])
                        )
                    )).tuples().all()
                )  # fmt: skip
                report = Report(
                    reporter_id=ids[reporter_email], subject_id=ids[subject_email], reason=ReportReason.fake,
                    details="E2E test report between two labelled fixtures.", status=ReportStatus.open, priority=3,
                )  # fmt: skip
                session.add(report)
                await session.commit()
                token, _ = await issue_enrollment(session, settings, None, ids[admin_email], system_clock())
                return {"email": admin_email, "enrollment_token": token, "report_id": str(report.id)}
        finally:
            await engine.dispose()

    print(json.dumps(run_async(go)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
