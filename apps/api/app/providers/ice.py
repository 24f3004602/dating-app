"""Relay servers for Live calls, behind an interface (stage 23, D123).

- `NoIce` (the default): Live is unavailable (503). The safe default on any
  server until a relay is set up: calls never fall back to direct connections,
  which would show each person the other's IP address.
- `DirectIce` (development and tests; refused on servers people use): no relay
  and no STUN, so devices offer only local candidates. Two browsers on one
  machine connect, and descriptions pass through uncleaned.
- `CloudflareIce`: Cloudflare Realtime TURN (docs read 2026-11-18; the pages
  are dated 2026-09-25). `POST https://rtc.live.cloudflare.com/v1/turn/keys/
  {key_id}/credentials/generate-ice-servers` with `Authorization: Bearer <the
  key's API token>` and `{"ttl": seconds}` answers 201 with `{"iceServers":
  [...]}`: a STUN entry and a TURN entry with a short-lived username and
  credential. Without trickle ICE the docs say to drop the port-53 URLs
  (browsers block them and they time out). The STUN entry goes too: with a
  relay-only policy it is never used. Tested against a fake server, not
  against Cloudflare.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import Settings

CLOUDFLARE_RTC = "https://rtc.live.cloudflare.com"


@dataclass(frozen=True)
class IceServer:
    urls: list[str]
    username: str | None = None
    credential: str | None = None


class IceUnavailableError(RuntimeError):
    """No relay is set up, or the relay service can't be reached (try later)."""


class IceProvider(Protocol):
    # True on servers people use: the apps ask for relay-only connections and
    # the server strips every other address from descriptions (calls/sdp.py).
    relay_only: bool

    async def servers(self, ttl_s: int) -> list[IceServer]: ...


class NoIce:
    relay_only: bool = True

    async def servers(self, ttl_s: int) -> list[IceServer]:
        raise IceUnavailableError("no relay is set up")


class DirectIce:
    relay_only: bool = False

    async def servers(self, ttl_s: int) -> list[IceServer]:
        return []


def _port(url: str) -> int | None:
    hostport = url.split(":", 1)[-1].split("?", 1)[0]
    _, _, port = hostport.rpartition(":")
    return int(port) if port.isdigit() else None


def _relay_urls(raw: object) -> list[str]:
    urls = [raw] if isinstance(raw, str) else raw if isinstance(raw, list) else []
    return [
        u for u in urls
        if isinstance(u, str) and u.startswith(("turn:", "turns:")) and _port(u) != 53
    ]  # fmt: skip


class CloudflareIce:
    relay_only: bool = True

    def __init__(self, key_id: str, api_token: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._path = f"/v1/turn/keys/{key_id}/credentials/generate-ice-servers"
        self._client = httpx.AsyncClient(
            base_url=CLOUDFLARE_RTC, timeout=10.0, transport=transport,
            headers={"authorization": f"Bearer {api_token}", "accept": "application/json"},
        )  # fmt: skip

    async def servers(self, ttl_s: int) -> list[IceServer]:
        try:
            res = await self._client.post(self._path, json={"ttl": ttl_s})
        except httpx.HTTPError as exc:
            raise IceUnavailableError("relay service unreachable") from exc
        if res.status_code not in (200, 201):
            raise IceUnavailableError(f"relay service answered {res.status_code}")
        try:
            entries = res.json()["iceServers"]
        except (ValueError, KeyError, TypeError) as exc:
            raise IceUnavailableError("relay service answered something unexpected") from exc
        found: list[IceServer] = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict):
                continue
            urls, username, credential = _relay_urls(entry.get("urls")), entry.get("username"), entry.get("credential")
            if urls and isinstance(username, str) and isinstance(credential, str):
                found.append(IceServer(urls=urls, username=username, credential=credential))
        if not found:
            raise IceUnavailableError("relay service gave no relay")
        return found

    async def aclose(self) -> None:
        await self._client.aclose()


def create_ice(settings: Settings) -> NoIce | DirectIce | CloudflareIce:
    if settings.calls_ice == "direct":
        return DirectIce()
    if settings.calls_ice == "cloudflare":
        if not (settings.cloudflare_turn_key_id and settings.cloudflare_turn_api_token):
            raise RuntimeError("cloudflare turn settings missing")  # the settings validator stops this earlier
        return CloudflareIce(settings.cloudflare_turn_key_id, settings.cloudflare_turn_api_token.get_secret_value())
    return NoIce()
