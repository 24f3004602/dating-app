"""The upload pipeline: limits, types, metadata stripping, re-encoding (T09)."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.modules.media.images import ImageRejectedError, ProcessedImage, process_image
from tests import images

LIMITS = {"max_bytes": 10 * 1024 * 1024, "max_pixels": 40_000_000, "min_side": 300}


def run(data: bytes) -> ProcessedImage:
    return process_image(data, **LIMITS)


def rejected(data: bytes) -> str:
    with pytest.raises(ImageRejectedError) as info:
        run(data)
    return info.value.code


def opened(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


def test_gps_and_all_metadata_are_stripped() -> None:
    source = images.jpeg(exif=images.gps_exif())
    assert b"SecretPhone" in source  # the fixture really carries metadata
    out = run(source)
    for blob in (out.large, out.small):
        img = opened(blob)
        assert img.format == "JPEG"
        assert len(img.getexif()) == 0
        assert "exif" not in img.info
        assert "icc_profile" not in img.info
        assert b"SecretPhone" not in blob
        assert b"PhoneMaker" not in blob
        assert b"Exif" not in blob


def test_exif_orientation_is_applied_before_stripping() -> None:
    # Orientation 6: the camera was turned; the upright photo is portrait.
    out = run(images.jpeg((600, 400), exif=images.gps_exif(orientation=6)))
    assert (out.width, out.height) == (400, 600)


def test_two_sizes_on_the_long_edge_without_upscaling() -> None:
    out = run(images.jpeg((3000, 2000)))
    assert (out.width, out.height) == (1080, 720)
    assert opened(out.small).size == (400, 267)
    small_source = run(images.jpeg((500, 400)))
    assert (small_source.width, small_source.height) == (500, 400)


@pytest.mark.parametrize(
    ("data", "fmt"),
    [(images.png(), "PNG"), (images.webp(), "WEBP"), (images.jpeg(mode="CMYK"), "JPEG")],
    ids=["png-with-alpha", "webp", "cmyk-jpeg"],
)
def test_accepted_formats_become_rgb_jpeg(data: bytes, fmt: str) -> None:
    out = run(data)
    assert out.source_format == fmt
    assert opened(out.large).mode == "RGB"


def test_polyglot_payloads_are_discarded() -> None:
    payload = b"<script>alert(document.cookie)</script>PK\x03\x04hidden.zip"
    out = run(images.jpeg() + payload)
    assert b"<script>" not in out.large
    assert b"PK\x03\x04" not in out.large


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"", "empty_file"),
        (b"x" * (10 * 1024 * 1024 + 1), "file_too_large"),
        (b"<html><script>alert(1)</script></html>", "unsupported_image"),
        (b"%PDF-1.7\n1 0 obj<<>>endobj", "unsupported_image"),
        (images.animated("GIF"), "unsupported_image"),  # GIF is not an allowed type
        (images.animated("PNG"), "animated_image"),  # APNG
        (images.animated("WEBP"), "animated_image"),
        (images.jpeg()[:2000], "corrupt_image"),  # truncated
        (images.jpeg((200, 900)), "image_too_small"),
        (images.png((8000, 6000), mode="L"), "too_many_pixels"),  # 48 MP
        (images.png_header_only(60_000, 60_000), "too_many_pixels"),  # 3.6 GP bomb, header only
    ],
    ids=[
        "empty", "over-10-mb", "html", "pdf", "gif", "apng", "animated-webp",
        "truncated", "too-small", "48-megapixels", "decompression-bomb",
    ],
)  # fmt: skip
def test_rejections(data: bytes, code: str) -> None:
    assert rejected(data) == code


def test_the_hash_is_of_the_original_upload() -> None:
    source = images.jpeg()
    first, second = run(source), run(source)
    assert first.sha256 == second.sha256
    assert run(images.jpeg(color="purple")).sha256 != first.sha256
