"""Safe image processing for uploads (threat model T09).

- Size and pixel limits are checked before decoding (decompression bombs).
- The type comes from the decoder, restricted to JPEG, PNG and WebP; the file
  name and the client's content type are ignored.
- Animated or multi-frame images are refused.
- Every upload is fully decoded, EXIF orientation applied, then re-encoded as
  a new JPEG with no metadata at all (no EXIF, GPS, XMP, ICC or comments).
  Anything appended to or hidden in the original (polyglots) is discarded.
- Two sizes: 1080 px and 400 px on the long edge.
"""

from __future__ import annotations

import hashlib
import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")
SIZES = {"large": 1080, "small": 400}
JPEG_QUALITY = 82


class ImageRejectedError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessedImage:
    large: bytes
    small: bytes
    width: int
    height: int
    source_format: str
    sha256: bytes  # of the original upload: an exact-duplicate abuse signal


def _flatten(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def _encode(img: Image.Image, long_edge: int) -> bytes:
    copy = img.copy()
    copy.thumbnail((long_edge, long_edge), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    # No exif=, icc_profile= or comment= arguments: the output carries no metadata.
    copy.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue()


def process_image(data: bytes, *, max_bytes: int, max_pixels: int, min_side: int) -> ProcessedImage:
    if not data:
        raise ImageRejectedError("empty_file")
    if len(data) > max_bytes:
        raise ImageRejectedError("file_too_large")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(io.BytesIO(data), formats=ALLOWED_FORMATS) as probe:
                source_format = str(probe.format)
                width, height = probe.size
                if width * height > max_pixels:
                    raise ImageRejectedError("too_many_pixels")
                if getattr(probe, "n_frames", 1) != 1 or getattr(probe, "is_animated", False):
                    raise ImageRejectedError("animated_image")
                probe.verify()
            with Image.open(io.BytesIO(data), formats=ALLOWED_FORMATS) as img:
                img.load()  # full decode: truncated or corrupt data fails here
                upright = ImageOps.exif_transpose(img)
                if min(upright.size) < min_side:
                    raise ImageRejectedError("image_too_small")
                rgb = _flatten(upright)
        except UnidentifiedImageError as exc:
            raise ImageRejectedError("unsupported_image") from exc
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ImageRejectedError("too_many_pixels") from exc
        except (OSError, SyntaxError, ValueError, EOFError) as exc:
            raise ImageRejectedError("corrupt_image") from exc

    large = _encode(rgb, SIZES["large"])
    small = _encode(rgb, SIZES["small"])
    with Image.open(io.BytesIO(large)) as check:
        out_w, out_h = check.size
    return ProcessedImage(
        large=large,
        small=small,
        width=out_w,
        height=out_h,
        source_format=source_format,
        sha256=hashlib.sha256(data).digest(),
    )
