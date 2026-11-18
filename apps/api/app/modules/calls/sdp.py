"""Cleaning session descriptions before the other person sees them (D123).

A WebRTC session description lists the network addresses a device can be
reached at (ICE candidates). Handed to a stranger, those addresses reveal the
device's public IP and, through it, roughly where the person is: the location
inference CLAUDE.md forbids. So on servers people use, calls go only through a
TURN relay (the apps ask for `iceTransportPolicy: "relay"`), and the server
enforces it too, whatever a device sends:

- every candidate that isn't a relay candidate is dropped;
- a relay candidate's related address (`raddr`, `rport`), which is the
  device's own public address as the relay saw it, becomes `0.0.0.0 0`;
- connection lines (`c=`) and `a=rtcp` addresses become 0.0.0.0 (ICE doesn't
  use the default address);
- a description with no relay candidate left is refused.

In development and tests ("direct"), descriptions pass through unchanged once
validated, so two browsers on one machine can connect without a relay.
"""

from __future__ import annotations

import re

MAX_SDP_CHARS = 20_000
_PRINTABLE = re.compile(r"[\x20-\x7e\t]*")
_PORT = re.compile(r"[0-9]{1,5}")


class InvalidSdpError(ValueError):
    pass


def _relay_candidate(line: str) -> str | None:
    """The cleaned relay candidate, or None for any other kind."""
    # a=candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> *(<name> <value>)
    parts = line[len("a=candidate:") :].split(" ")
    if len(parts) < 8 or parts[6] != "typ":
        raise InvalidSdpError("malformed candidate")
    if parts[7] != "relay":
        return None
    rest = parts[8:]
    if len(rest) % 2:
        raise InvalidSdpError("malformed candidate")
    # The related address is the device's own public address: replaced by one that says nothing.
    blank = {"raddr": "0.0.0.0", "rport": "0"}  # noqa: S104 - not a bind
    pairs: list[str] = []
    for name, value in zip(rest[::2], rest[1::2], strict=True):
        pairs += [name, blank.get(name, value)]
    return "a=candidate:" + " ".join(parts[:8] + pairs)


def _relay_line(line: str) -> str | None:
    """One line of a relay-only description, cleaned; None to drop it."""
    if line.startswith("a=candidate:"):
        return _relay_candidate(line)
    if line.startswith("c="):
        return "c=IN IP4 0.0.0.0"
    if line.startswith("a=rtcp:"):
        port = line[len("a=rtcp:") :].split(" ", 1)[0]
        if not _PORT.fullmatch(port):
            raise InvalidSdpError("malformed rtcp line")
        return f"a=rtcp:{port} IN IP4 0.0.0.0"
    return line


def clean_sdp(sdp: str, *, relay_only: bool) -> str:
    """Validate a description and, on relay-only servers, strip every address
    but the relay's. Raises InvalidSdpError."""
    if len(sdp) > MAX_SDP_CHARS:
        raise InvalidSdpError("too long")
    lines = sdp.replace("\r\n", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if not lines or lines[0] != "v=0":
        raise InvalidSdpError("not a session description")
    out: list[str] = []
    relays = 0
    for line in lines:
        if not _PRINTABLE.fullmatch(line) or len(line) < 2 or line[1] != "=":
            raise InvalidSdpError("malformed line")
        cleaned = _relay_line(line) if relay_only else line
        if cleaned is not None:
            relays += cleaned.startswith("a=candidate:")
            out.append(cleaned)
    if relay_only and relays == 0:
        raise InvalidSdpError("no relay candidate")
    return "\r\n".join(out) + "\r\n"
