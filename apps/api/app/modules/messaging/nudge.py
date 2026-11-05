"""Nudge terms (fixes.md: harassment; D075).

Two short lists, written for this app:

- `hurtful`: the app asks the sender "send anyway?" before sending.
- `money`: the recipient sees a safety tip under the message (romance and
  payment scams in India often move to UPI, OTPs or "investment").

Nothing is ever blocked or hidden because of these lists, and a match is
no proof of abuse: they nudge, and they help moderators sort reports
(stage 11). This is a starter list. Moderators should tune it with native
speakers, including regional, caste-based and religious slurs, before
launch. Leetspeak and deliberate misspellings are not caught.

Matching works on words: the text is NFKC-normalised and case-folded, then
split into runs of letters, combining marks and digits (so Devanagari words
stay whole). A term matches when its words appear consecutively. The app
uses the same rule (`apps/mobile/src/chat/nudge.ts`).
"""

from __future__ import annotations

import unicodedata

from app.modules.messaging.models import MessageFlag

VERSION = "2026-11-05"

HURTFUL: tuple[str, ...] = (
    # English
    "idiot", "stupid", "dumb", "moron", "loser", "worthless", "pathetic", "disgusting", "ugly", "fatso",
    "bitch", "slut", "whore", "bastard", "retard", "shut up", "kill yourself", "kys", "go die",
    "send nudes", "nudes",
    # Hindi and Hinglish, romanised. Words with an everyday meaning ("kutta",
    # dog; "saali", sister-in-law) and short forms ("bc") are left out on
    # purpose: too many false nudges.
    "chutiya", "chutiye", "kutti", "kamina", "kamini", "harami", "haramzada", "haramzadi",
    "randi", "gandu", "bhosdike", "madarchod", "behenchod", "bewakoof", "nalayak",
)  # fmt: skip

MONEY: tuple[str, ...] = (
    "send money", "transfer money", "pay me", "need money", "lend me", "loan", "upi", "upi id", "paytm",
    "gpay", "google pay", "phonepe", "bank account", "account number", "ifsc", "otp", "gift card",
    "bitcoin", "crypto", "investment", "forex", "western union",
)  # fmt: skip


def words(text: str) -> list[str]:
    """Runs of letters, marks and digits, after NFKC and case folding."""
    out: list[str] = []
    current: list[str] = []
    for ch in unicodedata.normalize("NFKC", text).casefold():
        if unicodedata.category(ch)[0] in {"L", "M", "N"}:
            current.append(ch)
        elif current:
            out.append("".join(current))
            current = []
    if current:
        out.append("".join(current))
    return out


def _phrases(terms: tuple[str, ...]) -> tuple[tuple[str, ...], ...]:
    return tuple(tuple(words(t)) for t in terms)


_LISTS: tuple[tuple[MessageFlag, tuple[tuple[str, ...], ...]], ...] = (
    (MessageFlag.hurtful, _phrases(HURTFUL)),
    (MessageFlag.money, _phrases(MONEY)),
)


def _contains(haystack: list[str], phrase: tuple[str, ...]) -> bool:
    size = len(phrase)
    return any(tuple(haystack[i : i + size]) == phrase for i in range(len(haystack) - size + 1))


def flag(text: str) -> MessageFlag | None:
    """The first list with a matching term (hurtful before money), or None."""
    found = words(text)
    for kind, phrases in _LISTS:
        if any(_contains(found, p) for p in phrases):
            return kind
    return None
