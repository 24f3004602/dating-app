"""Client IPs behind a proxy (stage 17): X-Forwarded-For counts only from
trusted proxies, so nobody picks their own IP to dodge per-IP rate limits."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.config import Settings
from tests.chat import LiveServer


async def seen_ip(live: LiveServer, forwarded: str | None) -> str:
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    async with httpx.AsyncClient() as c:
        r = await c.get(f"http://127.0.0.1:{live.port}/v1/_probe/ip", headers=headers)
    ip: str = r.json()["ip"]
    return ip


async def test_forwarded_addresses_are_ignored_unless_the_proxy_is_trusted(with_probes: FastAPI) -> None:
    async with LiveServer(with_probes) as live:  # the default: no trusted proxies
        assert await seen_ip(live, "203.0.113.9") == "127.0.0.1"
    async with LiveServer(with_probes, trusted_proxies=["127.0.0.1"]) as live:
        assert await seen_ip(live, "203.0.113.9") == "203.0.113.9"
        assert await seen_ip(live, None) == "127.0.0.1"
    async with LiveServer(with_probes, trusted_proxies=["10.0.0.0/8"]) as live:  # a network that isn't ours here
        assert await seen_ip(live, "203.0.113.9") == "127.0.0.1"


def test_trusted_proxies_must_be_addresses_or_networks(base_settings: Settings) -> None:
    values = base_settings.model_dump()
    for bad in (["*"], ["proxy.example.com"], ["10.0.0.0/33"]):
        with pytest.raises(ValidationError, match="never"):
            Settings.model_validate({**values, "trusted_proxies": bad})
    ok = Settings.model_validate({**values, "trusted_proxies": ["10.0.0.0/8", "::1", "192.0.2.7"]})
    assert ok.trusted_proxies == ["10.0.0.0/8", "::1", "192.0.2.7"]
