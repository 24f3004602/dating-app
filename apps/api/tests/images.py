"""Test images, generated in process (no binary fixtures in the repo)."""

from __future__ import annotations

import io
import struct
import zlib

from PIL import Image


def jpeg(size: tuple[int, int] = (1200, 900), *, color: str = "teal", exif: Image.Exif | None = None,
         mode: str = "RGB") -> bytes:  # fmt: skip
    out = io.BytesIO()
    img = Image.new(mode, size, color if mode == "RGB" else (0, 128, 128, 0)[: len(mode)])
    img.save(out, "JPEG", quality=90, **({"exif": exif.tobytes()} if exif is not None else {}))
    return out.getvalue()


def gps_exif(orientation: int | None = None) -> Image.Exif:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x0110] = "SecretPhone 9"  # Model
    if orientation is not None:
        exif[0x0112] = orientation
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (28.0, 37.0, 51.0)  # a precise location, Connaught Place
    gps[3] = "E"
    gps[4] = (77.0, 13.0, 4.0)
    return exif


def png(size: tuple[int, int] = (800, 800), mode: str = "RGBA") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (200, 50, 50, 128) if mode == "RGBA" else 128).save(out, "PNG")
    return out.getvalue()


def webp(size: tuple[int, int] = (800, 600)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, "orange").save(out, "WEBP")
    return out.getvalue()


def animated(fmt: str, size: tuple[int, int] = (400, 400)) -> bytes:
    frames = [Image.new("RGB", size, c) for c in ("red", "blue", "green")]
    out = io.BytesIO()
    frames[0].save(out, fmt, save_all=True, append_images=frames[1:], duration=100, loop=0)
    return out.getvalue()


def png_header_only(width: int, height: int) -> bytes:
    """A PNG that claims huge dimensions but has no pixel data (bomb probe)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IEND", b"")
