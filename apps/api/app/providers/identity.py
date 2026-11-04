"""External identity checks (liveness, ID, age assurance) behind an interface.

None is connected in the MVP. The default reports "not_checked", so no label
can ever claim a check that did not happen (D016, owner principle). A vendor
adapter needs a DPDP review of biometric data first (threat model T11, T12).
"""

from __future__ import annotations

import uuid
from typing import Literal, Protocol

IdentityStatus = Literal["not_checked", "verified", "failed"]


class IdentityVerifier(Protocol):
    async def status(self, user_id: uuid.UUID) -> IdentityStatus: ...


class NoIdentityVerifier:
    async def status(self, user_id: uuid.UUID) -> IdentityStatus:
        return "not_checked"
