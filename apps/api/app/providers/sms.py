"""SMS delivery behind an interface (D012).

Not used by any flow yet: phone sign-up waits for India DLT registration
(sender ID and templates) and an Indian SMS provider chosen by the owner.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

# E.164: + then 8 to 15 digits.
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


@dataclass(frozen=True)
class SmsMessage:
    to: str
    text: str
    # DLT requires every transactional SMS to use a registered template.
    dlt_template_id: str | None = None

    def __post_init__(self) -> None:
        if not E164.fullmatch(self.to):
            raise ValueError("SMS recipients must be E.164 numbers")


class SmsSender(Protocol):
    async def send(self, message: SmsMessage) -> None: ...


class MemorySmsSender:
    def __init__(self) -> None:
        self.outbox: list[SmsMessage] = []

    async def send(self, message: SmsMessage) -> None:
        self.outbox.append(message)


class UnavailableSmsSender:
    """The default until a provider exists: fails loudly instead of pretending."""

    async def send(self, message: SmsMessage) -> None:
        raise RuntimeError("SMS is not configured (needs DLT registration and a provider)")
