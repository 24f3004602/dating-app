"""F01 sign-up: age gate, validation, consents, enumeration, email verification."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.accounts.models import Consent, User, UserStatus
from app.modules.audit.models import AuditLog
from app.modules.auth.models import OneTimeCode
from app.modules.auth.service import VERIFY_EMAIL, VERIFY_FAILURES, VERIFY_IP
from tests.support import (
    OTHER_PASSWORD,
    PASSWORD,
    FrozenClock,
    JobRunner,
    bearer,
    birthdate_for_age,
    register,
    signup,
    without_request_id,
)

Db = async_sessionmaker[AsyncSession]


async def count(db: Db, model: type, *where: object) -> int:
    async with db() as s:
        return int((await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one())  # type: ignore[arg-type]


async def user_by_email(db: Db, email: str) -> User | None:
    async with db() as s:
        return (await s.execute(select(User).where(User.email_normalized == email))).scalar_one_or_none()


async def redis_keys(app: FastAPI) -> list[bytes]:
    prefix = app.state.settings.rate_limit_prefix
    return [k async for k in app.state.redis.scan_iter(match=f"{prefix}:*")]


# --- age gate ------------------------------------------------------------------


async def test_under_18_is_rejected_and_nothing_is_stored_or_counted(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    almost = birthdate_for_age(clock, 18, days_extra=-1)  # turns 18 tomorrow
    r = await register(client, app.state.settings, clock, "young@example.com", birthdate=almost)
    assert r.status_code == 422
    assert r.json()["code"] == "underage"
    assert await user_by_email(db, "young@example.com") is None
    assert await count(db, User) == 0
    assert await jobs.pending() == []
    assert await redis_keys(app) == []  # not even a rate-limit counter


async def test_exactly_18_today_is_accepted(app: FastAPI, client: AsyncClient, clock: FrozenClock) -> None:
    r = await register(
        client, app.state.settings, clock, "eighteen@example.com", birthdate=birthdate_for_age(clock, 18)
    )
    assert r.status_code == 202, r.text


async def test_today_is_the_india_date_not_the_utc_date(app: FastAPI, client: AsyncClient, clock: FrozenClock) -> None:
    # 19:00 UTC on 3 November is 00:30 IST on 4 November.
    clock.now = datetime(2026, 11, 3, 19, 0, tzinfo=UTC)
    r = await register(client, app.state.settings, clock, "ist@example.com", birthdate=date(2008, 11, 4))
    assert r.status_code == 202, r.text  # 18 in India today, though still 17 by the UTC date


@pytest.mark.parametrize("birthdate", [date(2099, 1, 1), date(1900, 1, 1)])
async def test_implausible_birthdates_are_rejected(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, birthdate: date
) -> None:
    r = await register(client, app.state.settings, clock, "when@example.com", birthdate=birthdate)
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_birthdate"


# --- validation -------------------------------------------------------------------


async def test_weak_password_is_rejected_with_reasons(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db
) -> None:
    r = await register(client, app.state.settings, clock, "weak@example.com", password="Haanji2026!!!!!!")
    assert r.status_code == 422
    assert r.json()["code"] == "weak_password"
    assert r.json()["problems"] == ["context"]
    assert "Haanji2026" not in r.text
    assert await count(db, User) == 0


@pytest.mark.parametrize(
    "bad",
    [
        {"email": "not-an-email"},
        {"email": "a@b"},
        {"birthdate": "04/11/1999"},
        {"password": ""},
        {"role": "admin"},  # unknown fields are rejected, never silently ignored
        {"consents": {"terms": "draft-2026-11", "privacy": "draft-2026-11", "marketing": True}},
    ],
)
async def test_invalid_bodies_are_rejected(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, bad: dict[str, object]
) -> None:
    r = await register(client, app.state.settings, clock, "valid@example.com", **{})
    assert r.status_code == 202  # the baseline body is valid
    body = {
        "email": "other@example.com",
        "password": PASSWORD,
        "birthdate": "1995-05-05",
        "consents": {"terms": "draft-2026-11", "privacy": "draft-2026-11"},
        **bad,
    }
    r = await client.post("/v1/auth/register", json=body)
    assert r.status_code == 422
    assert r.json()["code"] == "validation_error"
    assert PASSWORD not in r.text


async def test_stale_consent_versions_are_rejected(app: FastAPI, client: AsyncClient, db: Db) -> None:
    body = {
        "email": "consent@example.com",
        "password": PASSWORD,
        "birthdate": "1995-05-05",
        "consents": {"terms": "draft-2020-01", "privacy": app.state.settings.privacy_version},
    }
    r = await client.post("/v1/auth/register", json=body)
    assert r.status_code == 422
    assert r.json()["code"] == "consent_required"
    assert r.json()["required"]["terms"] == app.state.settings.terms_version
    assert await count(db, User) == 0


# --- happy path and storage ---------------------------------------------------------


async def test_sign_up_stores_a_pending_user_with_consents_and_queues_a_code(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    r = await register(client, app.state.settings, clock, "  New.Person@Example.COM ")
    assert r.status_code == 202
    assert r.json() == {"status": "accepted"}

    user = await user_by_email(db, "new.person@example.com")
    assert user is not None
    assert user.status is UserStatus.pending
    assert user.email_verified_at is None
    assert user.password_hash.startswith("$argon2id$")
    assert await count(db, Consent, Consent.user_id == user.id) == 2
    assert await count(db, AuditLog, AuditLog.action == "auth.register", AuditLog.target_id == user.id) == 1

    queued = await jobs.pending()
    assert [(name, args) for _, name, args in queued] == [
        ("auth:issue_code", {"user_id": str(user.id), "purpose": "verify_email"})
    ]  # only IDs in job arguments: no email, no code

    await jobs.run()
    (mail,) = jobs.mail_to("new.person@example.com")
    assert jobs.last_code in mail.text
    async with db() as s:
        row = (await s.execute(select(OneTimeCode).where(OneTimeCode.user_id == user.id))).scalar_one()
    assert len(row.code_hash) == 32
    assert jobs.last_code.encode() not in row.code_hash


async def test_verify_opens_a_session_with_honest_labels(client: AsyncClient, jobs: JobRunner, db: Db) -> None:
    session = await signup(client, jobs, "honest@example.com")
    assert session["token_type"] == "bearer"
    assert session["user"]["verification"] == {"age": "declared", "email": "verified", "identity": "not_checked"}
    assert session["user"]["status"] == "active"
    me = await client.get("/v1/me", headers=bearer(session["token"]))
    assert me.status_code == 200
    assert me.json()["verification"]["age"] == "declared"  # never "verified"
    assert me.json()["age"] == 27
    user = await user_by_email(db, "honest@example.com")
    assert user is not None
    assert user.email_verified_at is not None


# --- enumeration (T04) ----------------------------------------------------------------


async def test_sign_up_with_a_taken_address_looks_identical_and_changes_nothing(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, db: Db, jobs: JobRunner
) -> None:
    await signup(client, jobs, "taken@example.com")
    before = await user_by_email(db, "taken@example.com")
    assert before is not None

    fresh = await register(client, app.state.settings, clock, "fresh@example.com", OTHER_PASSWORD)
    taken = await register(client, app.state.settings, clock, "taken@example.com", OTHER_PASSWORD)
    assert without_request_id(fresh) == without_request_id(taken)

    after = await user_by_email(db, "taken@example.com")
    assert after is not None
    assert after.password_hash == before.password_hash  # not overwritten
    await jobs.run()
    notices = jobs.mail_to("taken@example.com")
    assert notices[-1].subject.startswith("Someone tried to sign up")
    login = await client.post("/v1/auth/login", json={"email": "taken@example.com", "password": PASSWORD})
    assert login.status_code == 200


async def test_resend_looks_identical_for_known_and_unknown_addresses(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    await register(client, app.state.settings, clock, "pending@example.com")
    await jobs.run()
    known = await client.post("/v1/auth/resend-code", json={"email": "pending@example.com"})
    unknown = await client.post("/v1/auth/resend-code", json={"email": "nobody@example.com"})
    assert without_request_id(known) == without_request_id(unknown) == (202, {"status": "accepted"}, "application/json")
    assert len(await jobs.pending()) == 1  # a job only for the real pending account
    # A second resend inside the cooldown is limited for both, alike.
    again_known = await client.post("/v1/auth/resend-code", json={"email": "pending@example.com"})
    again_unknown = await client.post("/v1/auth/resend-code", json={"email": "nobody@example.com"})
    assert again_known.status_code == again_unknown.status_code == 429
    assert again_known.json()["code"] == again_unknown.json()["code"] == "rate_limited"


# --- codes ------------------------------------------------------------------------------


async def test_wrong_expired_and_reused_codes_fail(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    email = "codes@example.com"
    await register(client, app.state.settings, clock, email)
    await jobs.run()
    code = jobs.last_code
    wrong = "000000" if code != "000000" else "111111"

    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": wrong, "password": PASSWORD})
    assert r.status_code == 400
    assert r.json()["code"] == "verification_failed"

    clock.advance(minutes=11)
    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": code, "password": PASSWORD})
    assert r.status_code == 400  # expired

    await client.post("/v1/auth/resend-code", json={"email": email})
    await jobs.run()
    fresh = jobs.last_code
    ok = await client.post("/v1/auth/verify-email", json={"email": email, "code": fresh, "password": PASSWORD})
    assert ok.status_code == 201
    reused = await client.post("/v1/auth/verify-email", json={"email": email, "code": fresh, "password": PASSWORD})
    assert reused.status_code == 400


async def test_a_code_dies_after_five_wrong_tries(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    email = "five@example.com"
    await register(client, app.state.settings, clock, email)
    await jobs.run()
    code = jobs.last_code
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(5):
        r = await client.post("/v1/auth/verify-email", json={"email": email, "code": wrong, "password": PASSWORD})
        assert r.status_code == 400
    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": code, "password": PASSWORD})
    assert r.status_code == 400  # the right code no longer works


async def test_a_new_code_does_not_reset_the_failure_count(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner, db: Db
) -> None:
    """NIST SP 800-63B-4: generating a new secret SHALL NOT reset the failed count."""
    email = "persist@example.com"
    limiter = app.state.auth.limiter

    async def forget_short_windows() -> None:
        # Simulate 15 minutes passing for the per-request windows only.
        await app.state.redis.delete(
            limiter._redis_key(VERIFY_EMAIL, f"verify_email:{email}"), limiter._redis_key(VERIFY_IP, "127.0.0.1")
        )

    for _ in range(2):  # two codes, five failures each
        await register(client, app.state.settings, clock, email)
        await jobs.run()
        wrong = f"{(int(jobs.last_code) + 1) % 1_000_000:06d}"
        for _ in range(5):
            await client.post("/v1/auth/verify-email", json={"email": email, "code": wrong, "password": PASSWORD})
        await forget_short_windows()

    await register(client, app.state.settings, clock, email)
    await jobs.run()
    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": jobs.last_code, "password": PASSWORD})
    assert r.status_code == 429  # ten failures today: a brand-new correct code is refused
    user = await user_by_email(db, email)
    assert user is not None
    assert await app.state.redis.get(limiter._redis_key(VERIFY_FAILURES, f"verify_email:{user.id}")) == b"10"


async def test_pre_hijacking_is_defeated(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    """The owner signs up, then a stranger re-registers the same unverified
    address with their own password before the owner enters the code (D045).

    Without the password check at verification, the owner's latest code would
    activate the account with the stranger's password.
    """
    owner = "victim@example.com"
    await register(client, app.state.settings, clock, owner, PASSWORD)
    await register(client, app.state.settings, clock, owner, OTHER_PASSWORD)  # the stranger, second
    await jobs.run()
    latest = jobs.last_code  # arrives in the owner's inbox

    r = await client.post("/v1/auth/verify-email", json={"email": owner, "code": latest, "password": PASSWORD})
    assert r.status_code == 400  # refused: the stored password is not the owner's
    stranger = await client.post("/v1/auth/login", json={"email": owner, "password": OTHER_PASSWORD})
    assert stranger.status_code == 403  # the stranger cannot get in: the address is unverified
    assert stranger.json()["code"] == "email_not_verified"

    # The owner simply signs up again; their password wins and the code binds to it.
    await register(client, app.state.settings, clock, owner, PASSWORD)
    await jobs.run()
    r = await client.post("/v1/auth/verify-email", json={"email": owner, "code": jobs.last_code, "password": PASSWORD})
    assert r.status_code == 201
    stranger = await client.post("/v1/auth/login", json={"email": owner, "password": OTHER_PASSWORD})
    assert stranger.status_code == 401


async def test_a_code_without_the_sign_up_password_fails(
    app: FastAPI, client: AsyncClient, clock: FrozenClock, jobs: JobRunner
) -> None:
    email = "bound@example.com"
    await register(client, app.state.settings, clock, email, PASSWORD)
    await jobs.run()
    r = await client.post(
        "/v1/auth/verify-email", json={"email": email, "code": jobs.last_code, "password": OTHER_PASSWORD}
    )
    assert r.status_code == 400
    r = await client.post("/v1/auth/verify-email", json={"email": email, "code": jobs.last_code, "password": PASSWORD})
    assert r.status_code == 201  # the code survived one wrong try


async def test_verify_for_an_unknown_address_looks_like_a_wrong_code(client: AsyncClient) -> None:
    r = await client.post(
        "/v1/auth/verify-email", json={"email": "ghost@example.com", "code": "123456", "password": PASSWORD}
    )
    assert r.status_code == 400
    assert r.json()["code"] == "verification_failed"


async def test_register_is_rate_limited_per_address(app: FastAPI, client: AsyncClient, clock: FrozenClock) -> None:
    for _ in range(5):
        assert (await register(client, app.state.settings, clock, "spam@example.com")).status_code == 202
    r = await register(client, app.state.settings, clock, "spam@example.com")
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0
