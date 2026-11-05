"""`.env.example` lists every setting (stage 17 preflight: production variables
must match it), with placeholders only, never a value that looks real."""

from __future__ import annotations

import re
from pathlib import Path

from app.config import Settings

EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"
TOOLS = {"TEST_DATABASE_NAME", "BOOTSTRAP_ADMIN_URL"}  # read by scripts, not by the app


def test_every_setting_is_listed_and_nothing_else() -> None:
    text = EXAMPLE.read_text(encoding="utf-8")
    listed = set(re.findall(r"^#?\s*([A-Z][A-Z0-9_]+)=", text, re.MULTILINE))
    names = {name.upper() for name in Settings.model_fields}
    assert names - listed == set(), "settings missing from .env.example"
    assert listed - names == TOOLS


def test_secrets_are_placeholders() -> None:
    text = EXAMPLE.read_text(encoding="utf-8")
    for name in ("APP_SECRET_KEY", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "EXPO_ACCESS_TOKEN"):
        (line,) = [entry for entry in text.splitlines() if re.match(rf"^#?\s*{name}=", entry)]
        assert "<" in line, line  # e.g. <key-secret>, never a value
    assert not re.search(r"KEY_ID=rzp_live_", text)  # live keys are only ever mentioned as refused
