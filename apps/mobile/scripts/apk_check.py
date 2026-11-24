"""Google Play's build requirements, checked on an APK with the standard library only.

    python3 apk_check.py <app.apk> [--min-target 36] [--version-code 17]

- the manifest's minSdkVersion and targetSdkVersion (binary XML, read by Android's attribute
  IDs): Play has required API level 36 for new apps and updates since 31 August 2026;
- with --version-code, that the APK carries the build's own number (stage 28d): Android refuses
  to install a lower versionCode over a higher one, and Play takes each number only once;
- every native library (lib/<abi>/*.so) ready for 16 KB memory pages: stored uncompressed at a
  16 KB zip offset (or compressed); its ELF LOAD segments aligned to at least 16 KB; and no
  writable bytes outside GNU_RELRO in the 16 KB pages a 16 KB linker makes read-only.
Sources (read 2026-11-24): developer.android.com/google/play/requirements/target-sdk and
developer.android.com/guide/practices/page-sizes. Exit 1 on any problem.
"""

from __future__ import annotations

import argparse
import struct
import sys
import zipfile

PAGE = 0x4000
ATTR_MIN_SDK, ATTR_TARGET_SDK, ATTR_VERSION_CODE = 0x0101020C, 0x01010270, 0x0101021B
NAMES = {ATTR_MIN_SDK: "minSdkVersion", ATTR_TARGET_SDK: "targetSdkVersion", ATTR_VERSION_CODE: "versionCode"}
PT_LOAD, PT_GNU_RELRO, PF_W = 1, 0x6474E552, 2


def manifest_sdks(data: bytes) -> dict[str, int]:
    """minSdkVersion, targetSdkVersion and versionCode from a binary AndroidManifest.xml."""
    res_ids: list[int] = []
    found: dict[str, int] = {}
    pos = 8  # after the XML chunk's own header
    while pos + 8 <= len(data):
        ctype, hsize, csize = struct.unpack_from("<HHI", data, pos)
        if csize == 0:
            break
        if ctype == 0x0180:  # resource map: attribute name index -> resource ID
            res_ids = list(struct.unpack_from(f"<{(csize - hsize) // 4}I", data, pos + hsize))
        elif ctype == 0x0102:  # start element: a 16-byte node header, then the attribute extension
            attr_start, attr_size, attr_count = struct.unpack_from("<HHH", data, pos + 16 + 8)
            for i in range(attr_count):
                _ns, name, _raw, _size, _res0, dtype, value = struct.unpack_from(
                    "<IIIHBBI", data, pos + 16 + attr_start + i * attr_size
                )
                rid = res_ids[name] if name < len(res_ids) else None
                if dtype == 0x10 and rid in NAMES:  # an integer
                    found[NAMES[rid]] = value
        pos += csize
    return found


def elf_problems(blob: bytes) -> list[str]:
    """What keeps a 64-bit shared library from running with 16 KB pages."""
    if blob[:4] != b"\x7fELF" or blob[4] != 2:
        return ["not a 64-bit ELF file"]
    (phoff,) = struct.unpack_from("<Q", blob, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", blob, 0x36)
    writable: list[tuple[int, int]] = []
    relro: tuple[int, int] | None = None
    problems: list[str] = []
    for i in range(phnum):
        p_type, p_flags, _off, p_vaddr, _paddr, _filesz, p_memsz, p_align = struct.unpack_from(
            "<IIQQQQQQ", blob, phoff + i * phentsize
        )
        if p_type == PT_LOAD:
            if p_align < PAGE:
                problems.append(f"LOAD aligned to {p_align:#x}")
            if p_flags & PF_W:
                writable.append((p_vaddr, p_vaddr + p_memsz))
        elif p_type == PT_GNU_RELRO:
            relro = (p_vaddr, p_vaddr + p_memsz)
    if relro:
        # A 16 KB linker makes RELRO's whole pages read-only: writable bytes outside RELRO
        # in those pages would fault when written.
        lo, hi = relro[0] // PAGE * PAGE, -(-relro[1] // PAGE) * PAGE
        for start, end in writable:
            for a, b in ((start, min(end, relro[0])), (max(start, relro[1]), end)):
                if a < b and a < hi and b > lo:
                    problems.append(
                        f"writable bytes {a:#x}-{b:#x} share a 16 KB page with GNU_RELRO {relro[0]:#x}-{relro[1]:#x}"
                    )
    return problems


def check(path: str, min_target: int | None = None, version_code: int | None = None) -> list[str]:
    """Every problem found, one line each; prints what it checked."""
    problems: list[str] = []
    with zipfile.ZipFile(path) as apk, open(path, "rb") as raw:
        sdks = manifest_sdks(apk.read("AndroidManifest.xml"))
        print(
            f"manifest: minSdkVersion {sdks.get('minSdkVersion')}, targetSdkVersion {sdks.get('targetSdkVersion')}, "
            f"versionCode {sdks.get('versionCode')}"
        )
        if min_target is not None and sdks.get("targetSdkVersion", 0) < min_target:
            problems.append(f"targetSdkVersion {sdks.get('targetSdkVersion')} is below {min_target}")
        if version_code is not None and sdks.get("versionCode") != version_code:
            problems.append(f"versionCode {sdks.get('versionCode')} isn't this build's {version_code}")
        libs = 0
        for info in apk.infolist():
            if not (info.filename.startswith("lib/") and info.filename.endswith(".so")):
                continue
            libs += 1
            notes: list[str] = []
            if info.compress_type == zipfile.ZIP_STORED:
                raw.seek(info.header_offset)
                name_len, extra_len = struct.unpack_from("<HH", raw.read(30), 26)
                offset = info.header_offset + 30 + name_len + extra_len
                if offset % PAGE:
                    notes.append(f"stored at zip offset {offset}, not a multiple of 16 KB")
            notes += elf_problems(apk.read(info.filename))
            problems += [f"{info.filename}: {note}" for note in notes]
        print(f"native libraries: {libs}, of which not ready for 16 KB pages: {len({p.split(':')[0] for p in problems if p.startswith('lib/')})}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("apk")
    parser.add_argument("--min-target", type=int, default=None, help="the lowest targetSdkVersion allowed")
    parser.add_argument("--version-code", type=int, default=None, help="the versionCode this build must carry")
    args = parser.parse_args(argv)
    problems = check(args.apk, args.min_target, args.version_code)
    for problem in problems:
        print(f"PROBLEM {problem}")
    print("ready for Google Play's target SDK and 16 KB page rules" if not problems else f"{len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
