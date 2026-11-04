"""Validation helpers for member-written text."""

from __future__ import annotations

import re
import unicodedata

# Zero-width non-joiner and joiner are format characters that Indic scripts
# (Devanagari, Bengali, ...) need; every other control or format character
# is refused.
_ALLOWED_FORMAT = {"\u200c", "\u200d"}
_LINK = re.compile(r"(?i)(https?://|www\.|\.(com|in|net|org|io|me)\b)")


def _bad_char(ch: str, *, allow_newline: bool) -> bool:
    if ch == "\n":
        return not allow_newline
    category = unicodedata.category(ch)
    return category in {"Cc", "Cs", "Co", "Cn"} or (category == "Cf" and ch not in _ALLOWED_FORMAT)


def clean_line(value: str) -> str:
    """NFC, trimmed, single line, no control characters, inner spaces collapsed."""
    text = unicodedata.normalize("NFC", value).strip()
    if any(_bad_char(ch, allow_newline=False) for ch in text):
        raise ValueError("contains characters that are not allowed")
    return re.sub(r"\s+", " ", text)


def clean_text(value: str, *, max_lines: int) -> str:
    """NFC, trimmed, Unix newlines, at most `max_lines` lines, no blank-line runs."""
    text = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n").strip()
    if any(_bad_char(ch, allow_newline=True) for ch in text):
        raise ValueError("contains characters that are not allowed")
    text = re.sub(r"\n{3,}", "\n\n", text)
    if text.count("\n") + 1 > max_lines:
        raise ValueError(f"use at most {max_lines} lines")
    return text


def clean_display_name(value: str) -> str:
    """A name, not a contact channel: no digits, @ or links."""
    name = clean_line(value)
    if any(ch.isdigit() for ch in name) or "@" in name or _LINK.search(name):
        raise ValueError("names can't contain numbers, @ or links")
    if not any(ch.isalpha() for ch in name):
        raise ValueError("use at least one letter")
    return name
