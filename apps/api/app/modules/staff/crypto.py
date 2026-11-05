"""Second-factor primitives (D090).

TOTP is RFC 6238 as authenticator apps expect it: SHA-1, 6 digits, 30-second
steps (pyotp). A code is accepted one step either side of now, and only for a
time step later than the last one accepted, so each code works once.

The TOTP secret has to be readable to check codes, so it is encrypted rather
than hashed: AES-256-GCM with a key derived from APP_SECRET_KEY and the user
ID as associated data (a secret copied to another user's row fails to
decrypt). This protects a leaked database or backup; it does not protect
against someone holding both the database and the app secret. Rotating
APP_SECRET_KEY means staff enrol again.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime

import pyotp
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.modules.auth.crypto import derive_key

STEP_S = 30
DIGITS = 6
WINDOW = 1  # steps either side of now
NONCE_BYTES = 12
RECOVERY_CODES = 10
# No 0/O or 1/l/I: codes are read off a screen or paper and typed.
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _aead(app_secret: str) -> AESGCM:
    return AESGCM(derive_key(app_secret, "staff-totp-secret"))


def encrypt_secret(app_secret: str, user_id: uuid.UUID, secret: str) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    return nonce + _aead(app_secret).encrypt(nonce, secret.encode(), user_id.bytes)


def decrypt_secret(app_secret: str, user_id: uuid.UUID, blob: bytes) -> str:
    """Raises cryptography's InvalidTag if the blob was altered or belongs to another user."""
    return _aead(app_secret).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], user_id.bytes).decode()


def new_totp_secret() -> str:
    return pyotp.random_base32(32)  # 160 bits, as RFC 4226 recommends


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    return pyotp.TOTP(secret, digits=DIGITS, interval=STEP_S).provisioning_uri(name=account, issuer_name=issuer)


def time_step(now: datetime) -> int:
    return int(now.timestamp()) // STEP_S


def matching_step(secret: str, code: str, now: datetime, after_step: int) -> int | None:
    """The time step `code` belongs to (within the window), if it is later than
    `after_step`; otherwise None. Compared in constant time."""
    if len(code) != DIGITS or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret, digits=DIGITS, interval=STEP_S)
    current = time_step(now)
    found = None
    for step in range(current - WINDOW, current + WINDOW + 1):
        if hmac.compare_digest(totp.generate_otp(step), code) and step > after_step:
            found = step
    return found


def new_recovery_codes() -> list[str]:
    """Ten codes like `k7mq-x2pd-a9hs` (about 70 bits each)."""
    return [
        "-".join("".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(4)) for _ in range(3))
        for _ in range(RECOVERY_CODES)
    ]


def normalise_recovery_code(code: str) -> str:
    return "".join(c for c in code.lower() if c.isalnum())


def recovery_code_hash(app_secret: str, user_id: uuid.UUID, code: str) -> bytes:
    key = derive_key(app_secret, "staff-recovery-code")
    return hmac.new(key, f"{user_id}:{normalise_recovery_code(code)}".encode(), hashlib.sha256).digest()


def new_enrollment_token() -> tuple[str, bytes]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).digest()


def enrollment_token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def new_challenge() -> tuple[str, str]:
    """A sign-in challenge and the digest it is stored under in Redis."""
    value = secrets.token_urlsafe(32)
    return value, hashlib.sha256(value.encode()).hexdigest()


def challenge_digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
