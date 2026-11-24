"""Tests for apk_check.py (PLAY-1 in replica/test-plan.md).

    python3 -m unittest discover -s apps/mobile/scripts -p "test_*.py"     (CI's mobile workflow)
"""

from __future__ import annotations

import io
import os
import struct
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apk_check as ac  # noqa: E402

R, RW, RE = 4, 6, 5


def elf(segments: list[tuple[int, int, int, int, int]]) -> bytes:
    """A 64-bit ELF header and program headers: (type, flags, vaddr, memsz, align) each."""
    header = bytearray(64)
    header[:5] = b"\x7fELF\x02"
    struct.pack_into("<Q", header, 0x20, 64)
    struct.pack_into("<HH", header, 0x36, 56, len(segments))
    table = b"".join(struct.pack("<IIQQQQQQ", t, f, 0, va, va, ms, ms, al) for t, f, va, ms, al in segments)
    return bytes(header) + table


def manifest(min_sdk: int, target_sdk: int) -> bytes:
    """A binary AndroidManifest.xml holding just <uses-sdk> with its two attributes."""
    res_map = struct.pack("<HHI", 0x0180, 8, 16) + struct.pack("<II", ac.ATTR_MIN_SDK, ac.ATTR_TARGET_SDK)
    attrs = b"".join(struct.pack("<IIIHBBI", 0xFFFFFFFF, i, 0xFFFFFFFF, 8, 0, 0x10, v) for i, v in enumerate((min_sdk, target_sdk)))
    ext = struct.pack("<IIHHHHHH", 0xFFFFFFFF, 0, 20, 20, 2, 0, 0, 0)
    node = struct.pack("<HHIII", 0x0102, 16, 16 + len(ext) + len(attrs), 1, 0xFFFFFFFF) + ext + attrs
    body = res_map + node
    return struct.pack("<HHI", 0x0003, 8, 8 + len(body)) + body


GOOD_LIB = elf([(ac.PT_LOAD, RE, 0, 0x680, 0x4000), (ac.PT_LOAD, RW, 0x4680, 0x1D8, 0x4000)])


class ElfTests(unittest.TestCase):
    """Google's four documented RELRO examples (developer.android.com/guide/practices/page-sizes)."""

    def test_relro_sharing_a_page_with_writable_data(self) -> None:
        lib = elf([(ac.PT_LOAD, RE, 0, 0x0CFAF0, 0x4000), (ac.PT_LOAD, RW, 0xDFAF0, 0x04510, 0x4000),
                   (ac.PT_GNU_RELRO, R, 0xDFAF0, 0x01510, 1)])  # fmt: skip
        self.assertEqual(ac.elf_problems(lib), ["writable bytes 0xe1000-0xe4000 share a 16 KB page with GNU_RELRO 0xdfaf0-0xe1000"])

    def test_compliant_layouts(self) -> None:
        aligned_end = elf([(ac.PT_LOAD, RE, 0, 0x0CFAF0, 0x4000), (ac.PT_LOAD, RW, 0xDFAF0, 0x03510, 0x4000),
                           (ac.PT_GNU_RELRO, R, 0xDFAF0, 0x00510, 1)])  # fmt: skip
        fills_its_load = elf([(ac.PT_LOAD, RE, 0, 0x680, 0x4000), (ac.PT_LOAD, RW, 0x4680, 0x980, 0x4000),
                              (ac.PT_GNU_RELRO, R, 0x4680, 0x980, 1)])  # fmt: skip
        # As AndroidX DataStore's library: RELRO past its LOAD's end, the next writable LOAD a page on.
        past_its_load = elf([(ac.PT_LOAD, RE, 0, 0x11C0, 0x4000), (ac.PT_LOAD, RW, 0x51C0, 0x268, 0x4000),
                             (ac.PT_LOAD, RW, 0x9428, 0x1, 0x4000), (ac.PT_GNU_RELRO, R, 0x51C0, 0xE40, 1)])  # fmt: skip
        for lib in (aligned_end, GOOD_LIB, fills_its_load, past_its_load):
            self.assertEqual(ac.elf_problems(lib), [])

    def test_4_kb_load_alignment(self) -> None:
        lib = elf([(ac.PT_LOAD, RE, 0, 0x680, 0x1000), (ac.PT_LOAD, RW, 0x1680, 0x1D8, 0x1000)])
        self.assertEqual(ac.elf_problems(lib), ["LOAD aligned to 0x1000", "LOAD aligned to 0x1000"])
        self.assertEqual(ac.elf_problems(b"\x7fELF\x01" + bytes(60)), ["not a 64-bit ELF file"])


class ApkTests(unittest.TestCase):
    def apk(self, target_sdk: int, stored_lib: bool) -> str:
        fd, path = tempfile.mkstemp(suffix=".apk")
        os.close(fd)
        self.addCleanup(os.remove, path)
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("AndroidManifest.xml", manifest(24, target_sdk))
            kind = zipfile.ZIP_STORED if stored_lib else zipfile.ZIP_DEFLATED
            z.writestr(zipfile.ZipInfo("lib/arm64-v8a/libgood.so"), GOOD_LIB, compress_type=kind)
        return path

    def run_check(self, path: str, min_target: int | None) -> list[str]:
        with redirect_stdout(io.StringIO()) as out:
            problems = ac.check(path, min_target)
        self.assertIn("manifest: minSdkVersion 24", out.getvalue())
        return problems

    def test_manifest_and_target(self) -> None:
        self.assertEqual(ac.manifest_sdks(manifest(24, 36)), {"minSdkVersion": 24, "targetSdkVersion": 36})
        self.assertEqual(self.run_check(self.apk(36, stored_lib=False), 36), [])
        self.assertEqual(self.run_check(self.apk(35, stored_lib=False), 36), ["targetSdkVersion 35 is below 36"])

    def test_zip_alignment_of_stored_libraries(self) -> None:
        problems = self.run_check(self.apk(36, stored_lib=True), None)
        self.assertEqual(len(problems), 1)
        self.assertIn("libgood.so: stored at zip offset", problems[0])

    def test_exit_status(self) -> None:
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ac.main([self.apk(36, stored_lib=False), "--min-target", "36"]), 0)
            self.assertEqual(ac.main([self.apk(34, stored_lib=False), "--min-target", "36"]), 1)


if __name__ == "__main__":
    unittest.main()
