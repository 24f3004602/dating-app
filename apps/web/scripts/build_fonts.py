"""Builds the website's Anek fonts (stage 20d, D101): WOFF2, subset, both variable axes kept.

    usage (from apps/web):
      uv run --no-project --python 3.13 --with fonttools==4.66.1 --with brotli==1.2.0 \
        python -I scripts/build_fonts.py <source-dir> public/fonts [../mobile/assets/fonts]

With a third path it also writes the member app's fonts (stage 20e, D105): static TTF
instances, one file per voice, because React Native on Android and Expo Font on the
web build choose a font by file, not by weight or width on a variable font.

<source-dir> holds AnekLatin.ttf and AnekDevanagari.ttf, the variable fonts from
github.com/EkType/Anek (fonts/*/variable, OFL-1.1), and OFL.txt. Nothing is installed.

- Files are served from /fonts for a year (next.config.ts): bump VERSION when they change.
- Latin: the usual Latin ranges (Basic Latin, Latin-1, punctuation, the rupee sign).
- Devanagari (stage 22a, D120: a whole page in Hindi at /hi): only the characters in
  scripts/devanagari-text.txt, which `node scripts/devanagari-text.mjs` writes from the
  Hindi page's words; the shaping rules for them are kept, so conjuncts and matras
  render. Two static cuts, since the variable font with every conjunct those letters
  can form is about 520 KB: text (wght 450, wdth 100) for paragraphs and the form,
  sign (wght 700, wdth 87.5) for names and plates. A third, tiny one holds only the
  language option's name (scripts/devanagari-label.txt), so the English page never
  fetches a whole Devanagari face for one word. A test checks the site's source
  against devanagari-text.txt.
"""

from __future__ import annotations

import pathlib
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+20B9,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
VERSION = "v1"  # the Latin file
DEVANAGARI_VERSION = "v2"  # one language per page (stage 22a): text and sign cuts, and the label
DEVANAGARI_TEXT = {"wght": 450, "wdth": 100}
DEVANAGARI_SIGN = {"wght": 700, "wdth": 87.5}
DEVANAGARI_INSTANCE = {"wght": 650, "wdth": 90}  # the app's name-only font (D105), unchanged
# Joiners and the dotted circle that shaping may need, beside the listed text.
DEVANAGARI_EXTRA = "\u200c\u200d\u25cc "  # ZWNJ, ZWJ, dotted circle, space


def build(
    source: pathlib.Path,
    target: pathlib.Path,
    *,
    unicodes: str | None = None,
    text: str | None = None,
    instance: dict[str, float] | None = None,
    flavor: str | None = "woff2",
) -> int:
    options = subset.Options()
    options.flavor = flavor
    options.layout_features = ["*"]  # every OpenType feature: conjuncts, kerning, figures
    options.hinting = False  # browsers and phones don't use TrueType hints; smaller files
    options.desubroutinize = True
    font = TTFont(source, recalcTimestamp=False)
    if instance:
        font = instancer.instantiateVariableFont(font, instance)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes) if unicodes else [], text=text or "")
    subsetter.subset(font)
    font.flavor = flavor
    font.recalcTimestamp = False  # keep the source's date: the same input builds the same file
    font.save(target)
    return target.stat().st_size


# The app's voices (D105): file name -> the instance it holds. Text at normal width,
# signs semi-condensed, like the website.
APP_VOICES = {
    "anek-text": {"wght": 400, "wdth": 100},
    "anek-text-semibold": {"wght": 600, "wdth": 100},
    "anek-sign": {"wght": 700, "wdth": 87.5},
    "anek-display": {"wght": 760, "wdth": 87.5},
}


def build_app(source: pathlib.Path, app: pathlib.Path) -> dict[str, int]:
    """The app's Devanagari covers only its own list, devanagari-text.txt beside its fonts."""
    app.mkdir(parents=True, exist_ok=True)
    text = (app / "devanagari-text.txt").read_text(encoding="utf-8")
    sizes = {
        f"app/{name}.ttf": build(
            source / "AnekLatin.ttf", app / f"{name}.ttf", unicodes=LATIN, instance=instance, flavor=None
        )
        for name, instance in APP_VOICES.items()
    }
    sizes["app/anek-devanagari.ttf"] = build(
        source / "AnekDevanagari.ttf",
        app / "anek-devanagari.ttf",
        text=text + DEVANAGARI_EXTRA,
        instance=DEVANAGARI_INSTANCE,
        flavor=None,
    )
    shutil.copyfile(source / "OFL.txt", app / "OFL.txt")
    return sizes


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):  # noqa: PLR2004 - two paths, or three with the app's
        print(__doc__, file=sys.stderr)
        return 2
    source, out = pathlib.Path(argv[1]), pathlib.Path(argv[2])
    out.mkdir(parents=True, exist_ok=True)
    here = pathlib.Path(__file__)
    text = here.with_name("devanagari-text.txt").read_text(encoding="utf-8")
    label = here.with_name("devanagari-label.txt").read_text(encoding="utf-8").strip()
    devanagari = source / "AnekDevanagari.ttf"
    sizes = {
        f"anek-latin-{VERSION}.woff2": build(
            source / "AnekLatin.ttf", out / f"anek-latin-{VERSION}.woff2", unicodes=LATIN
        ),
    }
    for name, instance, letters in (
        ("text", DEVANAGARI_TEXT, text),
        ("sign", DEVANAGARI_SIGN, text),
        ("label", DEVANAGARI_SIGN, label),
    ):
        file = f"anek-devanagari-{name}-{DEVANAGARI_VERSION}.woff2"
        sizes[file] = build(devanagari, out / file, text=letters + DEVANAGARI_EXTRA, instance=instance)
    shutil.copyfile(source / "OFL.txt", out / "OFL.txt")
    if len(argv) == 4:  # noqa: PLR2004 - the app's fonts too
        sizes |= build_app(source, pathlib.Path(argv[3]))
    for name, size in sizes.items():
        print(f"{name}: {size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
