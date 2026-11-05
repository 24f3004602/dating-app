"""Staff sign-in with a second factor (stage 14, D090): separate sessions,
enrolment only with a one-time token, TOTP codes and recovery codes that work
once, attempt limits, idle and absolute expiry, and no secrets in logs."""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pyotp
import pytest
from cryptography.exceptions import InvalidTag
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import select, update

from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.staff import crypto, service
from app.modules.staff.models import StaffEnrollment, StaffMfa
from tests.chat import Db
from tests.members import Member, make_member
from tests.support import PASSWORD, FrozenClock, without_request_id


@pytest.fixture
def now(clock: FrozenClock) -> datetime:
    clock.now = datetime.fromisoformat("2026-11-05T09:00:10+00:00")
    return clock.now


async def staff_member(app: FastAPI, db: Db, now: datetime, role: str = "moderator") -> tuple[Member, str]:
    """A staff account with a real password (and, from make_member, an app session)."""
    who = await make_member(db, app.state.storage, now, role=role, profile=False)
    async with db() as s:
        await s.execute(
            update(User).where(User.id == who.id).values(password_hash=app.state.auth.passwords.hash(PASSWORD))
        )
        email = (await s.execute(select(User.email_normalized).where(User.id == who.id))).scalar_one()
        await s.commit()
    return who, email


async def token_for(app: FastAPI, db: Db, who: Member, now: datetime) -> str:
    async with db() as s:
        token, _ = await service.issue_enrollment(s, app.state.settings, None, who.id, now)  # the CLI's path
    return token


async def challenge(client: AsyncClient, email: str, password: str = PASSWORD) -> dict[str, Any]:
    r = await client.post("/v1/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def verify(client: AsyncClient, value: str, code: str) -> Response:
    return await client.post("/v1/admin/auth/verify", json={"challenge": value, "code": code})


async def enrolled(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, *, who: Member, email: str
) -> tuple[str, dict[str, Any]]:
    """Enrol through the API; returns the TOTP secret and the session response."""
    token = await token_for(app, db, who, clock())
    step = await challenge(client, email)
    assert step["next"] == "enroll"
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": token})
    assert r.status_code == 200, r.text
    secret = r.json()["secret"]
    r = await verify(client, step["challenge"], pyotp.TOTP(secret).at(clock()))
    assert r.status_code == 201, r.text
    return secret, r.json()


def bearer(body: dict[str, Any]) -> dict[str, str]:
    return {"authorization": f"Bearer {body['token']}"}


async def actions(db: Db, target: uuid.UUID) -> list[str]:
    async with db() as s:
        rows = await s.execute(
            select(AuditLog.action).where(AuditLog.target_id == target).order_by(AuditLog.created_at)
        )
        return list(rows.scalars())


# --- the primitives --------------------------------------------------------------


def test_totp_matches_rfc_6238_and_each_code_works_once() -> None:
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # the RFC's key, "12345678901234567890"
    assert pyotp.TOTP(secret, digits=8).at(59) == "94287082"  # RFC 6238, appendix B
    assert pyotp.TOTP(secret, digits=8).at(1111111109) == "07081804"

    def at(ts: int) -> datetime:
        return datetime.fromtimestamp(ts, UTC)

    code = "287082"  # step 1 (59 s), 6 digits
    assert crypto.matching_step(secret, code, at(59), after_step=0) == 1
    assert crypto.matching_step(secret, code, at(89), after_step=0) == 1  # one step late: still accepted
    assert crypto.matching_step(secret, code, at(89), after_step=1) is None  # already used
    assert crypto.matching_step(secret, code, at(125), after_step=0) is None  # too old
    assert crypto.matching_step(secret, "28708", at(59), after_step=0) is None
    assert crypto.matching_step(secret, "28708a", at(59), after_step=0) is None


def test_secrets_are_encrypted_and_bound_to_their_owner() -> None:
    key = "k" * 40
    owner, other = uuid.uuid4(), uuid.uuid4()
    secret = crypto.new_totp_secret()
    blob = crypto.encrypt_secret(key, owner, secret)
    assert secret.encode() not in blob
    assert crypto.decrypt_secret(key, owner, blob) == secret
    assert crypto.encrypt_secret(key, owner, secret) != blob  # a fresh nonce each time
    with pytest.raises(InvalidTag):
        crypto.decrypt_secret(key, other, blob)  # copied to another account: useless
    with pytest.raises(InvalidTag):
        crypto.decrypt_secret(key, owner, blob[:-1] + bytes([blob[-1] ^ 1]))  # altered
    with pytest.raises(InvalidTag):
        crypto.decrypt_secret("x" * 40, owner, blob)  # another app secret
    codes = crypto.new_recovery_codes()
    assert len(set(codes)) == 10
    assert all(len(c) == 14 and c.count("-") == 2 for c in codes)
    assert crypto.recovery_code_hash(key, owner, codes[0].upper()) == crypto.recovery_code_hash(key, owner, codes[0])


# --- separate sessions -----------------------------------------------------------


async def test_app_and_staff_sessions_never_stand_in_for_each_other(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    moderator, email = await staff_member(app, db, now)
    assert (await client.get("/v1/admin/auth/me", headers=moderator.headers)).status_code == 401  # the app session
    _, session = await enrolled(app, client, db, clock, who=moderator, email=email)
    assert (await client.get("/v1/admin/auth/me", headers=bearer(session))).status_code == 200
    assert (await client.get("/v1/me", headers=bearer(session))).status_code == 401  # staff session as a member
    assert (await client.post("/v1/realtime/ticket", headers=bearer(session))).status_code == 401


# --- sign-in and enrolment -------------------------------------------------------


async def test_sign_in_takes_the_password_then_an_enrolment_token_then_a_code(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    moderator, email = await staff_member(app, db, now)
    admin, admin_email = await staff_member(app, db, now, role="admin")
    member = await make_member(db, app.state.storage, now, profile=False)
    async with db() as s:
        await s.execute(
            update(User).where(User.id == member.id).values(password_hash=app.state.auth.passwords.hash(PASSWORD))
        )
        member_email = (await s.execute(select(User.email_normalized).where(User.id == member.id))).scalar_one()
        await s.commit()

    # Wrong password, unknown email, and a member's right password: one answer.
    answers = [
        await client.post("/v1/admin/auth/login", json={"email": email, "password": "not the right one at all"}),
        await client.post("/v1/admin/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}),
        await client.post("/v1/admin/auth/login", json={"email": member_email, "password": PASSWORD}),
    ]
    assert [without_request_id(r) for r in answers] == [without_request_id(answers[0])] * 3
    assert answers[0].status_code == 401

    # No authenticator yet: the password alone isn't enough.
    step = await challenge(client, email)
    assert step["next"] == "enroll"
    assert datetime.fromisoformat(step["expires_at"]) == now + timedelta(minutes=5)
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": "x" * 43})
    assert (r.status_code, r.json()["code"]) == (400, "enrollment_invalid")
    r = await verify(client, step["challenge"], "123456")
    assert (r.status_code, r.json()["code"]) == (400, "code_invalid")

    # An admin (signed in with their own second factor) issues a one-time token.
    _, admin_session = await enrolled(app, client, db, clock, who=admin, email=admin_email)
    r = await client.post(f"/v1/admin/staff/{moderator.id}/enrollment", headers=bearer(admin_session))
    assert r.status_code == 201, r.text
    token = r.json()["enrollment_token"]
    assert datetime.fromisoformat(r.json()["expires_at"]) == now + timedelta(hours=24)

    step = await challenge(client, email)
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": token})
    assert r.status_code == 200, r.text
    secret, uri = r.json()["secret"], r.json()["otpauth_uri"]
    assert uri.startswith("otpauth://totp/")
    assert "issuer=Haanji%20staff" in uri
    good = pyotp.TOTP(secret).at(clock())
    wrong = f"{(int(good) + 1) % 1_000_000:06d}"
    assert (await verify(client, step["challenge"], wrong)).json()["code"] == "code_invalid"
    r = await verify(client, step["challenge"], good)
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["recovery_codes"]) == 10
    assert body["staff"] == {"id": str(moderator.id), "email": email, "role": "moderator", "recovery_codes_left": 10}
    assert datetime.fromisoformat(body["expires_at"]) == now + timedelta(hours=12)
    assert body["idle_timeout_s"] == 1800
    assert (await verify(client, step["challenge"], good)).json()["code"] == "challenge_invalid"  # used up

    # The token worked once; the account is now enrolled.
    step = await challenge(client, email)
    assert step["next"] == "verify"
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": token})
    assert (r.status_code, r.json()["code"]) == (409, "already_enrolled")
    async with db() as s:
        mfa = await s.get(StaffMfa, moderator.id)
        assert mfa is not None
        assert secret.encode() not in mfa.secret_enc
        used = (await s.execute(select(StaffEnrollment).where(StaffEnrollment.user_id == moderator.id))).scalars().all()
        assert [t.used_at is not None for t in used] == [True]  # the admin's token, now used
    assert "staff.mfa_enrolled" in await actions(db, moderator.id)
    assert "staff.enrollment_issued" in await actions(db, moderator.id)


async def test_codes_and_recovery_codes_work_once(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    moderator, email = await staff_member(app, db, now)
    secret, first = await enrolled(app, client, db, clock, who=moderator, email=email)
    code = pyotp.TOTP(secret).at(clock())
    step = await challenge(client, email)
    assert (await verify(client, step["challenge"], code)).json()["code"] == "code_invalid"  # replayed
    clock.advance(seconds=30)
    assert (await verify(client, step["challenge"], pyotp.TOTP(secret).at(clock()))).status_code == 201

    recovery = first["recovery_codes"][0]
    step = await challenge(client, email)
    r = await verify(client, step["challenge"], recovery.upper())  # typed in capitals: still fine
    assert r.status_code == 201, r.text
    assert r.json()["staff"]["recovery_codes_left"] == 9
    step = await challenge(client, email)
    assert (await verify(client, step["challenge"], recovery)).json()["code"] == "code_invalid"
    assert "staff.recovery_code_used" in await actions(db, moderator.id)


async def test_wrong_codes_end_the_challenge_and_then_the_day(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    moderator, email = await staff_member(app, db, now)
    secret, _ = await enrolled(app, client, db, clock, who=moderator, email=email)
    clock.advance(seconds=60)
    good = pyotp.TOTP(secret).at(clock())
    wrong = f"{(int(good) + 1) % 1_000_000:06d}"
    step = await challenge(client, email)
    for _ in range(5):
        assert (await verify(client, step["challenge"], wrong)).json()["code"] == "code_invalid"
    assert (await verify(client, step["challenge"], good)).json()["code"] == "challenge_invalid"  # 5 per challenge
    step = await challenge(client, email)
    for _ in range(5):
        await verify(client, step["challenge"], wrong)
    step = await challenge(client, email)
    r = await verify(client, step["challenge"], good)  # 10 wrong today: even the right code waits
    assert (r.status_code, r.json()["code"]) == (429, "rate_limited")


# --- the session -----------------------------------------------------------------


async def test_staff_sessions_end_after_30_idle_minutes_or_12_hours(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    moderator, email = await staff_member(app, db, now)
    secret, session = await enrolled(app, client, db, clock, who=moderator, email=email)

    async def me(body: dict[str, Any]) -> Response:
        return await client.get("/v1/admin/auth/me", headers=bearer(body))

    for _ in range(2):
        clock.advance(minutes=29)
        assert (await me(session)).status_code == 200  # activity keeps it alive
    clock.advance(minutes=31)
    assert (await me(session)).status_code == 401  # idle

    clock.advance(seconds=30)
    step = await challenge(client, email)
    r = await verify(client, step["challenge"], pyotp.TOTP(secret).at(clock()))
    session = r.json()
    for _ in range(35):  # busy all day, every 20 minutes
        clock.advance(minutes=20)
        assert (await me(session)).status_code == 200
    clock.advance(minutes=20)  # 12 hours after sign-in
    assert (await me(session)).status_code == 401

    clock.advance(seconds=30)
    step = await challenge(client, email)
    session = (await verify(client, step["challenge"], pyotp.TOTP(secret).at(clock()))).json()
    assert (await client.post("/v1/admin/auth/logout", headers=bearer(session))).status_code == 204
    assert (await me(session)).status_code == 401


# --- enrolment tokens ---------------------------------------------------------------


async def test_only_another_admin_can_reset_an_authenticator(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime
) -> None:
    admin, admin_email = await staff_member(app, db, now, role="admin")
    moderator, email = await staff_member(app, db, now)
    member = await make_member(db, app.state.storage, now, profile=False)
    _, admin_session = await enrolled(app, client, db, clock, who=admin, email=admin_email)
    secret, mod_session = await enrolled(app, client, db, clock, who=moderator, email=email)
    url = "/v1/admin/staff/{}/enrollment"

    r = await client.post(url.format(admin.id), headers=bearer(mod_session))
    assert (r.status_code, r.json()["code"]) == (403, "admin_only")
    r = await client.get("/v1/admin/staff", headers=bearer(mod_session))
    assert (r.status_code, r.json()["code"]) == (403, "admin_only")
    listed = (await client.get("/v1/admin/staff", headers=bearer(admin_session))).json()
    assert sorted((s["id"], s["role"], s["enrolled"]) for s in listed) == sorted(
        [(str(admin.id), "admin", True), (str(moderator.id), "moderator", True)]
    )  # members aren't listed
    r = await client.post(url.format(admin.id), headers=bearer(admin_session))
    assert (r.status_code, r.json()["code"]) == (409, "own_account")
    for target in (member.id, uuid.uuid4()):
        assert (await client.post(url.format(target), headers=bearer(admin_session))).status_code == 404

    # A reset: the old authenticator, recovery codes and staff sessions stop working.
    r = await client.post(url.format(moderator.id), headers=bearer(admin_session))
    assert r.status_code == 201
    first = r.json()["enrollment_token"]
    assert (await client.get("/v1/admin/auth/me", headers=bearer(mod_session))).status_code == 401
    clock.advance(seconds=30)
    step = await challenge(client, email)
    assert step["next"] == "enroll"
    assert (await verify(client, step["challenge"], pyotp.TOTP(secret).at(clock()))).json()["code"] == "code_invalid"

    # A newer token replaces the older one; tokens expire after 24 hours.
    second = (await client.post(url.format(moderator.id), headers=bearer(admin_session))).json()["enrollment_token"]
    step = await challenge(client, email)
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": first})
    assert r.json()["code"] == "enrollment_invalid"
    clock.advance(hours=24, seconds=1)
    step = await challenge(client, email)
    r = await client.post("/v1/admin/auth/enroll", json={"challenge": step["challenge"], "enrollment_token": second})
    assert r.json()["code"] == "enrollment_invalid"
    async with db() as s:
        issued = (
            (
                await s.execute(
                    select(AuditLog).where(
                        AuditLog.action == "staff.enrollment_issued", AuditLog.target_id == moderator.id
                    )
                )
            )
            .scalars()
            .all()
        )
    assert [(e.actor_id, e.details["via"]) for e in issued] == [(None, "cli"), (admin.id, "admin"), (admin.id, "admin")]


async def test_logs_never_hold_secrets_codes_or_tokens(
    app: FastAPI, client: AsyncClient, db: Db, clock: FrozenClock, now: datetime, *, captured_logs: io.StringIO
) -> None:
    moderator, email = await staff_member(app, db, now)
    secret, session = await enrolled(app, client, db, clock, who=moderator, email=email)
    output = captured_logs.getvalue()
    assert output  # requests were logged
    for value in (
        secret,
        pyotp.TOTP(secret).at(clock()),
        session["token"],
        *session["recovery_codes"],
        PASSWORD,
        email,
    ):
        assert value not in output
