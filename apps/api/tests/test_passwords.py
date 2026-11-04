"""Password policy (NIST SP 800-63B-4) and hashing."""

from __future__ import annotations

import unicodedata

import pytest

from app.modules.auth.passwords import PasswordProblem, Passwords, blocklist, password_problems
from tests.support import OTHER_PASSWORD, PASSWORD

EMAIL = "priya.sharma1990@example.com"


def problems(pw: str, email: str = EMAIL) -> list[PasswordProblem]:
    return password_problems(pw, email=email, brand="Haanji", min_length=15, max_length=128)


def test_the_test_passwords_are_acceptable() -> None:
    assert problems(PASSWORD) == []
    assert problems(OTHER_PASSWORD) == []


@pytest.mark.parametrize(
    ("pw", "expected"),
    [
        ("a" * 14, [PasswordProblem.too_short]),
        ("x" * 129, [PasswordProblem.too_long]),
        ("123456789012345", [PasswordProblem.breached]),
        ("Haanji2026!!!!!!", [PasswordProblem.context]),  # the service name plus digits and symbols
        ("haanji-haanji-haanji", [PasswordProblem.context]),
        ("PriyaSharma1990!!!", [PasswordProblem.context]),  # the email's local part
        ("priya.sharma1990@example.com", [PasswordProblem.context]),  # the email itself
        ("ŋ" * 16, [PasswordProblem.repetitive]),
        ("kqkqkqkqkqkqkqkqkq", [PasswordProblem.repetitive]),
        # Both: a breached password that is also trivially repetitive.
        ("zzzzzzzzzzzzzzzz", [PasswordProblem.breached, PasswordProblem.repetitive]),
        ("abcabcabcabcabcabc", [PasswordProblem.repetitive]),
    ],
)
def test_rejections(pw: str, expected: list[PasswordProblem]) -> None:
    assert problems(pw) == expected


def test_no_composition_rules_and_whole_password_comparison() -> None:
    # Lowercase letters and spaces only: fine (no composition rules).
    assert problems("plain lowercase words only here") == []
    # The service name inside a longer passphrase is fine: NIST compares the
    # entire password, not substrings.
    assert problems("my haanji account for weekends") == []


def test_length_counts_unicode_code_points_after_nfc() -> None:
    # 15 Devanagari code points: allowed even though it is 45 UTF-8 bytes.
    hindi = "नमस्ते दोस्तों आप कै"[:15]
    assert len(hindi) == 15
    assert PasswordProblem.too_short not in problems(hindi)
    # A decomposed "é" is two code points before NFC and one after.
    decomposed = unicodedata.normalize("NFD", "é") * 14
    assert len(decomposed) == 28
    assert problems(decomposed) == [PasswordProblem.too_short]


def test_blocklist_is_loaded_casefolded() -> None:
    words = blocklist()
    assert len(words) > 10_000
    assert all(w == w.casefold() for w in list(words)[:500])
    assert problems("1234567890123456".upper()) == [PasswordProblem.breached]


def test_hash_and_verify_with_normalization_and_spaces() -> None:
    passwords = Passwords("test")
    nfd = unicodedata.normalize("NFD", "café crème brûlée tonight")
    nfc = unicodedata.normalize("NFC", nfd)
    stored = passwords.hash(nfd)
    assert stored.startswith("$argon2id$")
    assert passwords.verify(stored, nfc)
    spaced = passwords.hash("  leading and trailing spaces  ")
    assert passwords.verify(spaced, "  leading and trailing spaces  ")
    assert not passwords.verify(spaced, "leading and trailing spaces")


def test_verify_never_succeeds_without_a_real_hash() -> None:
    passwords = Passwords("test")
    assert not passwords.verify(None, "dummy password for equal timing")
    assert not passwords.verify("!", PASSWORD)  # unusable fixture password
    assert not passwords.verify("not-a-hash", PASSWORD)


def test_rehash_is_needed_when_parameters_change() -> None:
    cheap, strong = Passwords("test"), Passwords("rfc9106_low_memory")
    stored = cheap.hash(PASSWORD)
    assert strong.needs_rehash(stored)
    assert not cheap.needs_rehash(stored)
