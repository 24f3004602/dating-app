"""Build the list of Indian towns members can pick as their area (stage 29a, D162).

Source: GeoNames (https://www.geonames.org), licensed under Creative Commons Attribution 4.0
(https://creativecommons.org/licenses/by/4.0/), "as is", without warranty of accuracy. Download
these three files from https://download.geonames.org/export/dump/ into one folder:
cities15000.zip, admin1CodesASCII.txt and admin2Codes.txt. Then:

    uv run python scripts/build_india_areas.py <that folder> migrations/data/india_areas.csv

What it keeps: Indian places with more than 15,000 people (GeoNames' cities15000), except
abandoned or historical ones, places in Delhi, and places within 8 km of one of Delhi NCR's
hand-picked areas (migration 0004), which cover them. Names are GeoNames' plain-letter
spelling; the second column is the state. Coordinates are rounded to 0.01 degree (about 1 km)
and never leave the server (D020). A name that appears twice in a state gets its district.
"""

from __future__ import annotations

import ast
import csv
import io
import math
import pathlib
import re
import sys
import zipfile
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parents[1]
NCR_MIGRATION = ROOT / "migrations" / "versions" / "0004_profiles_media.py"
DELHI_ADMIN1 = "07"
NCR_RADIUS_KM = 8.0
SKIP_FEATURES = {"PPLQ", "PPLH", "PPLW"}  # abandoned, historical, destroyed
FEATURED_POPULATION = 2_000_000
# Well-known cities for the list shown before anyone types, besides capitals and the largest.
# GeoNames' populations are uneven (some suburbs carry a whole city's), so this is chosen by hand.
FEATURED_EXTRA = {
    ("Guwahati", "Assam"),
    ("Visakhapatnam", "Andhra Pradesh"),
    ("Vijayawada", "Andhra Pradesh"),
    ("Indore", "Madhya Pradesh"),
    ("Vadodara", "Gujarat"),
    ("Rajkot", "Gujarat"),
    ("Kochi", "Kerala"),
    ("Kozhikode", "Kerala"),
    ("Mysuru", "Karnataka"),
    ("Mangaluru", "Karnataka"),
    ("Ludhiana", "Punjab"),
    ("Amritsar", "Punjab"),
    ("Agra", "Uttar Pradesh"),
    ("Varanasi", "Uttar Pradesh"),
    ("Prayagraj", "Uttar Pradesh"),
    ("Madurai", "Tamil Nadu"),
    ("Nashik", "Maharashtra"),
}
# Old or everyday names people search for, keyed by GeoNames' plain-letter name (D162).
ALIASES: dict[str, tuple[str, ...]] = {
    "Mumbai": ("bombay",),
    "Bengaluru": ("bangalore",),
    "Kolkata": ("calcutta",),
    "Chennai": ("madras",),
    "Pune": ("poona",),
    "Thiruvananthapuram": ("trivandrum",),
    "Kochi": ("cochin",),
    "Mysuru": ("mysore",),
    "Vadodara": ("baroda",),
    "Varanasi": ("banaras", "benares"),
    "Puducherry": ("pondicherry",),
    "Kozhikode": ("calicut",),
    "Mangaluru": ("mangalore",),
    "Belagavi": ("belgaum",),
    "Prayagraj": ("allahabad",),
    "Visakhapatnam": ("vizag",),
    "Shimla": ("simla",),
    "Thoothukudi": ("tuticorin",),
    "Tiruchirappalli": ("trichy",),
    "Hubballi": ("hubli",),
    "Kalaburagi": ("gulbarga",),
    "Ballari": ("bellary",),
    "Panjim": ("panaji",),
    "Vijayapura": ("bijapur",),
    "Gurugram": ("gurgaon",),
}


@dataclass
class Town:
    geonameid: str
    name: str
    state: str
    district: str
    latitude: float
    longitude: float
    population: int
    feature: str


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(min(1.0, math.sqrt(h)))


def ncr_centroids() -> list[tuple[float, float]]:
    """Delhi NCR's areas, read from migration 0004 without importing it."""
    tree = ast.parse(NCR_MIGRATION.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "AREAS" for t in node.targets):
            return [(float(lat), float(lon)) for _id, _city, _name, lat, lon in ast.literal_eval(node.value)]
    raise SystemExit("AREAS not found in migration 0004")


def read_codes(path: pathlib.Path, prefix: str) -> dict[str, str]:
    codes: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if parts[0].startswith(prefix):
            codes[parts[0][len(prefix) :]] = parts[2]  # the plain-letter name
    return codes


def plain(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def district_label(name: str) -> str:
    """GeoNames' district names vary ("Bhilwara District", "District Rampur", "Dindigul-Dist.")."""
    words = re.sub(r"\b(District|Division|Dist)\b\.?", " ", name)
    return plain(words.strip(" -.,"))


def town_name(name: str) -> str:
    """GeoNames' plain-letter name, with a district in brackets tidied ("V.S.K.Valasai (Dindigul-Dist.)")."""
    return re.sub(r"\(([^)]*)\)", lambda m: f"({district_label(m.group(1))})", plain(name))


def featured(t: Town) -> bool:
    return t.feature in {"PPLA", "PPLC"} or t.population >= FEATURED_POPULATION or (t.name, t.state) in FEATURED_EXTRA


def build(folder: pathlib.Path) -> list[dict[str, str]]:
    states = read_codes(folder / "admin1CodesASCII.txt", "IN.")
    districts = read_codes(folder / "admin2Codes.txt", "IN.")
    ncr = ncr_centroids()
    towns: list[Town] = []
    with zipfile.ZipFile(folder / "cities15000.zip") as archive, archive.open("cities15000.txt") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            c = line.rstrip("\n").split("\t")
            if c[8] != "IN" or c[7] in SKIP_FEATURES or c[10] == DELHI_ADMIN1:
                continue
            lat, lon = float(c[4]), float(c[5])
            if min(distance_km(lat, lon, a, b) for a, b in ncr) < NCR_RADIUS_KM:
                continue
            towns.append(
                Town(
                    c[0],
                    town_name(c[2]),
                    states[c[10]],
                    districts.get(f"{c[10]}.{c[11]}", ""),
                    lat,
                    lon,
                    int(c[14]),
                    c[7],
                )
            )

    # A name twice in one state: the larger keeps it, the others get their district.
    by_key: dict[tuple[str, str], list[Town]] = {}
    for t in towns:
        by_key.setdefault((t.name.lower(), t.state), []).append(t)
    for same in by_key.values():
        same.sort(key=lambda t: -t.population)
        for t in same[1:]:
            district = district_label(t.district)
            t.name = f"{t.name} ({district})" if district and district != t.name else f"{t.name} ({t.geonameid})"
    names = [(t.name.lower(), t.state) for t in towns]
    if len(names) != len(set(names)):
        raise SystemExit("a name is still repeated within a state")

    rows = []
    for t in sorted(towns, key=lambda t: (t.state, t.name)):
        if len(t.name) > 64 or len(t.state) > 48:  # the areas table's limits
            raise SystemExit(f"too long for the areas table: {t}")
        rows.append(
            {
                "id": f"gn.{t.geonameid}",
                "city": t.state,
                "name": t.name,
                "latitude": f"{t.latitude:.2f}",
                "longitude": f"{t.longitude:.2f}",
                "population": str(t.population),
                "featured": "1" if featured(t) else "0",
                "aliases": " ".join(ALIASES.get(t.name, ())),
            }
        )
    return rows


def main() -> None:
    folder, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    rows = build(folder)
    found = {r["name"] for r in rows}
    missing = sorted(set(ALIASES) - found - {"Gurugram"})  # Gurugram is NCR's own (migration 0004)
    unfeatured = sorted(
        f"{n}, {s}" for n, s in FEATURED_EXTRA if not any(r["name"] == n and r["city"] == s for r in rows)
    )
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    out.write_bytes(buffer.getvalue().encode("utf-8"))
    featured = [f"{r['name']}, {r['city']}" for r in rows if r["featured"] == "1"]
    print(
        f"{len(rows)} towns in {len({r['city'] for r in rows})} states and union territories; {len(featured)} featured"
    )
    print("featured:", "; ".join(featured))
    print("aliases without a town:", missing)
    print("featured names without a town:", unfeatured)
    print("renamed duplicates:", [r["name"] for r in rows if r["name"].endswith(")")])


if __name__ == "__main__":
    main()
