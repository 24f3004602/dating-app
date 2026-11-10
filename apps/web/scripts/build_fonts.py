"""Builds the website's Anek fonts (stage 20d, D101): WOFF2, subset, both variable axes kept.

    usage (from apps/web):
      uv run --no-project --python 3.13 --with fonttools==4.66.1 --with brotli==1.2.0 \
        python -I scripts/build_fonts.py <source-dir> public/fonts

<source-dir> holds AnekLatin.ttf and AnekDevanagari.ttf, the variable fonts from
github.com/EkType/Anek (fonts/*/variable, OFL-1.1), and OFL.txt. Nothing is installed.

- Files are served from /fonts for a year (next.config.ts): bump VERSION when they change.
- Latin: the usual Latin ranges (Basic Latin, Latin-1, punctuation, the rupee sign).
- Devanagari: only the characters in scripts/devanagari-text.txt, which lists every
  Devanagari string the site shows; the shaping rules for them are kept, so conjuncts
  and matras render. Add new Hindi copy there and run this again (a test checks the
  site's source against that file).
"""

from __future__ import annotations

import pathlib
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+20B9,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
VERSION = "v1"
# Joiners and the dotted circle that shaping may need, beside the listed text.
DEVANAGARI_EXTRA = "\u200c\u200d\u25cc "  # ZWNJ, ZWJ, dotted circle, space


def build(source: pathlib.Path, target: pathlib.Path, *, unicodes: str | None = None, text: str | None = None) -> int:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]  # every OpenType feature: conjuncts, kerning, figures
    options.hinting = False  # browsers on phones don't use TrueType hints; smaller files
    options.desubroutinize = True
    font = TTFont(source)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes) if unicodes else [], text=text or "")
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)
    return target.stat().st_size


def main(argv: list[str]) -> int:
    if len(argv) != 3:  # noqa: PLR2004 - two paths
        print(__doc__, file=sys.stderr)
        return 2
    source, out = pathlib.Path(argv[1]), pathlib.Path(argv[2])
    out.mkdir(parents=True, exist_ok=True)
    text = pathlib.Path(__file__).with_name("devanagari-text.txt").read_text(encoding="utf-8")
    sizes = {
        f"anek-latin-{VERSION}.woff2": build(
            source / "AnekLatin.ttf", out / f"anek-latin-{VERSION}.woff2", unicodes=LATIN
        ),
        f"anek-devanagari-{VERSION}.woff2": build(
            source / "AnekDevanagari.ttf", out / f"anek-devanagari-{VERSION}.woff2", text=text + DEVANAGARI_EXTRA
        ),
    }
    shutil.copyfile(source / "OFL.txt", out / "OFL.txt")
    for name, size in sizes.items():
        print(f"{name}: {size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
