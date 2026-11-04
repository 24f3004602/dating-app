"""Password hashing (Argon2id) and policy (NIST SP 800-63B-4, D042).

Policy: at least 15 characters (single-factor), at most 128, counted in
Unicode code points after NFC; no composition rules; the *whole* password is
compared with a breach-corpus blocklist, with context words (the service name,
the email address and its local part) and with trivial repetition.
"""

from __future__ import annotations

import enum
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from argon2 import PasswordHasher, profiles
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

BLOCKLIST_PATH = Path(__file__).resolve().parents[2] / "data" / "password-blocklist.txt"
_NON_LETTERS = re.compile(r"[\W\d_]+")


class PasswordProblem(enum.StrEnum):
    too_short = "too_short"
    too_long = "too_long"
    breached = "breached"
    context = "context"
    repetitive = "repetitive"


def normalize(password: str) -> str:
    return unicodedata.normalize("NFC", password)


@lru_cache(maxsize=1)
def blocklist() -> frozenset[str]:
    with BLOCKLIST_PATH.open(encoding="utf-8") as fh:
        return frozenset(line.rstrip("\n") for line in fh if line.strip() and not line.startswith("#"))


def _is_repetitive(pw: str) -> bool:
    """A short unit (1-4 characters) repeated, e.g. 'aaaa...' or 'abcabc...'."""
    for size in range(1, 5):
        unit = pw[:size]
        if len(pw) >= 2 * size and unit * (len(pw) // size) + unit[: len(pw) % size] == pw:
            return True
    return False


def _context_words(email: str, brand: str) -> set[str]:
    local = email.split("@", 1)[0]
    words = {_NON_LETTERS.sub("", w.casefold()) for w in (brand, local)}
    return {w for w in words if len(w) >= 3}


def _is_context_derivative(pw: str, email: str, brand: str) -> bool:
    folded = pw.casefold()
    if folded in {email.casefold(), email.split("@", 1)[0].casefold()}:
        return True
    # Letters only, so "Haanji2026!!!" and "haanji-haanji" count as derivatives.
    core = _NON_LETTERS.sub("", folded)
    for word in _context_words(email, brand):
        if core and len(core) % len(word) == 0 and word * (len(core) // len(word)) == core:
            return True
    return False


def password_problems(
    password: str, *, email: str, brand: str, min_length: int, max_length: int
) -> list[PasswordProblem]:
    pw = normalize(password)
    if len(pw) < min_length:
        return [PasswordProblem.too_short]
    if len(pw) > max_length:
        return [PasswordProblem.too_long]
    problems: list[PasswordProblem] = []
    if pw.casefold() in blocklist():
        problems.append(PasswordProblem.breached)
    if _is_context_derivative(pw, email, brand):
        problems.append(PasswordProblem.context)
    if _is_repetitive(pw):
        problems.append(PasswordProblem.repetitive)
    return problems


class Passwords:
    """Argon2id hashing. The "test" profile is cheap and refused in production."""

    def __init__(self, profile: str) -> None:
        params = profiles.CHEAPEST if profile == "test" else profiles.RFC_9106_LOW_MEMORY
        self._hasher = PasswordHasher.from_parameters(params)
        # Verified against when no account exists, so timing does not reveal it.
        self._dummy = self._hasher.hash("dummy password for equal timing")

    def hash(self, password: str) -> str:
        return self._hasher.hash(normalize(password))

    def verify(self, stored_hash: str | None, password: str) -> bool:
        try:
            return self._hasher.verify(stored_hash or self._dummy, normalize(password)) and stored_hash is not None
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, stored_hash: str) -> bool:
        try:
            return self._hasher.check_needs_rehash(stored_hash)
        except InvalidHashError:
            return False
