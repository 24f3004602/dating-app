"""Tokens, one-time codes and keyed hashes."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid


def derive_key(secret: str, label: str) -> bytes:
    """A purpose-specific key from the app secret (domain separation)."""
    return hmac.new(secret.encode(), f"datingapp:{label}".encode(), hashlib.sha256).digest()


def new_session_token() -> tuple[str, bytes]:
    """An opaque 256-bit token and the SHA-256 digest that is stored (D023)."""
    token = secrets.token_urlsafe(32)
    return token, hash_session_token(token)


def hash_session_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def new_code() -> str:
    """Six random decimal digits."""
    return f"{secrets.randbelow(1_000_000):06d}"


def code_digest(key: bytes, user_id: uuid.UUID, purpose: str, code: str) -> bytes:
    """HMAC-SHA256 bound to the user and purpose, so a code is useless elsewhere."""
    return hmac.new(key, f"{purpose}:{user_id}:{code}".encode(), hashlib.sha256).digest()


def digests_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(a, b)


def banned_email_digest(key: bytes, email: str) -> bytes:
    """HMAC-SHA256 of a normalised email, kept for a year after a banned account
    is purged (D083). Without the key it can't be reversed or checked."""
    return hmac.new(key, email.encode(), hashlib.sha256).digest()
