"""Push notifications behind an interface (architecture: providers; D093).

- `NoPushSender` (default): sends nothing. Push needs the owner's EAS project,
  Firebase credentials and an Apple developer account first.
- `MemoryPushSender` (tests).
- `ExpoPushSender`: Expo's push service (docs.expo.dev, "Sending notifications",
  read 2026-11-05): POST https://exp.host/--/api/v2/push/send with up to 100
  messages, tickets in the same order; receipts later from /getReceipts (up to
  1000 IDs). `DeviceNotRegistered` means the token is dead. Tested against a
  fake server, not against Expo.

Messages carry only discreet text and a kind (never names, message text or IDs).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.config import Settings

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
SEND_BATCH = 100
RECEIPT_BATCH = 1000


@dataclass(frozen=True)
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PushTicket:
    """One per message, in order. `error` is Expo's code, e.g. DeviceNotRegistered."""

    token: str
    ok: bool
    receipt_id: str | None = None
    error: str | None = None


class PushUnavailableError(RuntimeError):
    """The whole request failed in a way worth retrying (network, 429, 5xx)."""


class PushSender(Protocol):
    async def send(self, messages: list[PushMessage]) -> list[PushTicket]: ...
    async def receipts(self, ids: list[str]) -> dict[str, str | None]: ...


class NoPushSender:
    async def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        return []

    async def receipts(self, ids: list[str]) -> dict[str, str | None]:
        return {}


class MemoryPushSender:
    def __init__(self) -> None:
        self.sent: list[PushMessage] = []
        self.dead: set[str] = set()  # tokens to answer DeviceNotRegistered for

    async def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        out = []
        for m in messages:
            self.sent.append(m)
            if m.to in self.dead:
                out.append(PushTicket(token=m.to, ok=False, error="DeviceNotRegistered"))
            else:
                out.append(PushTicket(token=m.to, ok=True, receipt_id=f"r-{len(self.sent)}"))
        return out

    async def receipts(self, ids: list[str]) -> dict[str, str | None]:
        return dict.fromkeys(ids)


class ExpoPushSender:
    def __init__(self, access_token: str | None, transport: httpx.AsyncBaseTransport | None = None) -> None:
        headers = {"accept": "application/json", "content-type": "application/json"}
        if access_token:
            headers["authorization"] = f"Bearer {access_token}"
        self._client = httpx.AsyncClient(headers=headers, timeout=10.0, transport=transport)

    async def _post(self, url: str, body: object) -> dict[str, object]:
        try:
            res = await self._client.post(url, json=body)
        except httpx.HTTPError as exc:
            raise PushUnavailableError("push service unreachable") from exc
        if res.status_code == 429 or res.status_code >= 500:
            raise PushUnavailableError(f"push service answered {res.status_code}")
        res.raise_for_status()  # 4xx: our request is wrong; retrying won't help
        payload: dict[str, object] = res.json()
        return payload

    async def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        tickets: list[PushTicket] = []
        for start in range(0, len(messages), SEND_BATCH):
            batch = messages[start : start + SEND_BATCH]
            body = [
                {"to": m.to, "title": m.title, "body": m.body, "data": m.data, "sound": "default", "priority": "high"}
                for m in batch
            ]
            data = self._post_data(await self._post(SEND_URL, body))
            for message, ticket in zip(batch, data, strict=True):
                if ticket.get("status") == "ok":
                    tickets.append(PushTicket(token=message.to, ok=True, receipt_id=str(ticket.get("id"))))
                else:
                    details = ticket.get("details")
                    error = details.get("error") if isinstance(details, dict) else None
                    tickets.append(PushTicket(token=message.to, ok=False, error=str(error or "error")))
        return tickets

    @staticmethod
    def _post_data(payload: dict[str, object]) -> list[dict[str, object]]:
        data = payload.get("data")
        if not isinstance(data, list):
            raise PushUnavailableError("unexpected push service answer")
        return [t for t in data if isinstance(t, dict)]

    async def receipts(self, ids: list[str]) -> dict[str, str | None]:
        """Receipt ID -> error code (None if delivered). IDs without a receipt yet are left out."""
        out: dict[str, str | None] = {}
        for start in range(0, len(ids), RECEIPT_BATCH):
            payload = await self._post(RECEIPTS_URL, {"ids": ids[start : start + RECEIPT_BATCH]})
            data = payload.get("data")
            if not isinstance(data, dict):
                continue
            for receipt_id, receipt in data.items():
                if not isinstance(receipt, dict):
                    continue
                details = receipt.get("details")
                error = details.get("error") if isinstance(details, dict) else None
                out[str(receipt_id)] = None if receipt.get("status") == "ok" else str(error or "error")
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


def create_push_sender(settings: Settings) -> NoPushSender | MemoryPushSender | ExpoPushSender:
    if settings.push_backend == "memory":
        return MemoryPushSender()
    if settings.push_backend == "expo":
        token = settings.expo_access_token.get_secret_value() if settings.expo_access_token else None
        return ExpoPushSender(token)
    return NoPushSender()
