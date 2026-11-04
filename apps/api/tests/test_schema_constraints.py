"""Database constraints and runtime-role privileges, against real PostgreSQL."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from psycopg import errors as pg_errors
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.modules.accounts.models import User
from app.modules.audit.models import AuditLog
from app.modules.auth.models import CodePurpose, OneTimeCode, Session, SessionClient

NOW = datetime.now(UTC)


def digest(seed: str) -> bytes:
    return hashlib.sha256(seed.encode()).digest()


async def make_user(session: AsyncSession, email: str = "member@example.test") -> User:
    user = User(email_normalized=email, password_hash="!", birthdate=date(1995, 6, 1))
    session.add(user)
    await session.flush()
    return user


def code(user: User, purpose: CodePurpose, *, consumed: bool = False, seed: str = "c") -> OneTimeCode:
    return OneTimeCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=digest(seed),
        expires_at=NOW + timedelta(minutes=10),
        consumed_at=NOW if consumed else None,
    )


def constraint_of(exc: DBAPIError) -> str | None:
    orig = exc.orig
    return getattr(getattr(orig, "diag", None), "constraint_name", None)


async def flush_in_savepoint(session: AsyncSession, obj: object) -> None:
    async with session.begin_nested():
        session.add(obj)
        await session.flush()


async def expect_violation(session: AsyncSession, obj: object, constraint: str) -> None:
    with pytest.raises(IntegrityError) as info:
        await flush_in_savepoint(session, obj)
    assert constraint_of(info.value) == constraint


# --- users -----------------------------------------------------------------


async def test_email_normalized_is_unique(session: AsyncSession) -> None:
    await make_user(session, "same@example.test")
    dup = User(email_normalized="same@example.test", password_hash="!", birthdate=date(1990, 1, 1))
    await expect_violation(session, dup, "uq_users_email_normalized")


async def test_email_must_be_stored_lowercase(session: AsyncSession) -> None:
    bad = User(email_normalized="Mixed@Example.test", password_hash="!", birthdate=date(1990, 1, 1))
    await expect_violation(session, bad, "ck_users_email_lowercase")


async def test_user_defaults(session: AsyncSession) -> None:
    user = await make_user(session)
    await session.refresh(user)
    assert user.status == "pending"
    assert user.role == "member"
    assert isinstance(user.id, uuid.UUID)
    assert user.id.version == 4  # random, not enumerable
    assert user.created_at.tzinfo is not None


async def test_unknown_status_is_rejected(db_conn: AsyncConnection) -> None:
    with pytest.raises(IntegrityError) as info:
        async with db_conn.begin_nested():
            await db_conn.execute(
                text(
                    "INSERT INTO users (email_normalized, password_hash, birthdate, status) "
                    "VALUES ('x@example.test', '!', '1990-01-01', 'verified')"
                )
            )
    assert constraint_of(info.value) == "ck_users_status"


# --- one-time codes --------------------------------------------------------


async def test_only_one_live_code_per_user_and_purpose(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(code(user, CodePurpose.verify_email, seed="first"))
    await session.flush()
    await expect_violation(session, code(user, CodePurpose.verify_email, seed="second"), "uq_one_time_codes_live")


async def test_a_new_code_is_allowed_once_the_old_one_is_consumed(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(code(user, CodePurpose.verify_email, consumed=True, seed="old"))
    session.add(code(user, CodePurpose.verify_email, seed="new"))
    await session.flush()


async def test_live_codes_for_different_purposes_or_users_coexist(session: AsyncSession) -> None:
    a = await make_user(session, "a@example.test")
    b = await make_user(session, "b@example.test")
    session.add_all(
        [
            code(a, CodePurpose.verify_email, seed="1"),
            code(a, CodePurpose.reset_password, seed="2"),
            code(b, CodePurpose.verify_email, seed="3"),
        ]
    )
    await session.flush()


async def test_code_hash_must_be_32_bytes(session: AsyncSession) -> None:
    user = await make_user(session)
    bad = OneTimeCode(
        user_id=user.id, purpose=CodePurpose.verify_email, code_hash=b"123456", expires_at=NOW + timedelta(minutes=10)
    )
    await expect_violation(session, bad, "ck_one_time_codes_code_hash_hmac_sha256")


# --- sessions ----------------------------------------------------------------


async def test_session_token_hash_is_unique_and_sha256_sized(session: AsyncSession) -> None:
    user = await make_user(session)

    def sess(token_hash: bytes) -> Session:
        return Session(
            user_id=user.id, token_hash=token_hash, client=SessionClient.mobile, expires_at=NOW + timedelta(days=30)
        )

    session.add(sess(digest("t")))
    await session.flush()
    await expect_violation(session, sess(digest("t")), "uq_sessions_token_hash")
    await expect_violation(session, sess(b"raw-token-not-a-hash"), "ck_sessions_token_hash_sha256")


async def test_deleting_a_user_cascades_to_sessions_and_codes(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(
        Session(
            user_id=user.id, token_hash=digest("s"), client=SessionClient.mobile, expires_at=NOW + timedelta(days=1)
        )
    )
    session.add(code(user, CodePurpose.reset_password))
    await session.flush()
    await session.execute(delete(User).where(User.id == user.id))
    for model in (Session, OneTimeCode):
        assert (await session.execute(select(func.count()).select_from(model))).scalar_one() == 0


# --- audit log and privileges --------------------------------------------------


async def test_audit_log_is_append_only_for_the_runtime_role(session: AsyncSession) -> None:
    session.add(AuditLog(action="test.event", details={"n": 1}))
    await session.flush()
    for stmt in (update(AuditLog).values(action="test.tampered"), delete(AuditLog)):
        with pytest.raises(DBAPIError) as info:
            async with session.begin_nested():
                await session.execute(stmt)
        assert isinstance(info.value.orig, pg_errors.InsufficientPrivilege)


async def test_audit_action_format_and_metadata_shape(session: AsyncSession) -> None:
    await expect_violation(session, AuditLog(action="NoDots"), "ck_audit_log_action_format")
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await session.execute(text("INSERT INTO audit_log (action, metadata) VALUES ('test.event', '[1]')"))


@pytest.mark.parametrize(
    "ddl",
    ["CREATE TABLE intruder (id int)", "DROP TABLE users", "TRUNCATE users", "ALTER TABLE users ADD COLUMN x int"],
)
async def test_runtime_role_cannot_run_ddl(db_conn: AsyncConnection, ddl: str) -> None:
    with pytest.raises(DBAPIError) as info:
        async with db_conn.begin_nested():
            await db_conn.execute(text(ddl))
    assert isinstance(info.value.orig, pg_errors.InsufficientPrivilege)
