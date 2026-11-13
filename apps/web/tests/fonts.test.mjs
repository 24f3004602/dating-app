// WEB-FONT-1..3 (stage 20d, D101; stage 22a, D120): the self-hosted Anek files exist,
// the Devanagari subsets cover every Devanagari letter the site's source shows, and
// their letter lists are the ones the dictionaries make.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { en } from "../lib/i18n/en.ts";

const web = resolve(import.meta.dirname, "..");

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sources(path);
    return /\.(tsx?|mjs)$/.test(name) ? [path] : [];
  });
}

test("WEB-FONT-1: every font file fonts.css loads is here, small, with its licence", () => {
  const css = readFileSync(join(web, "app/fonts.css"), "utf8");
  const files = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(files, [
    "anek-latin-v1.woff2",
    "anek-devanagari-text-v2.woff2",
    "anek-devanagari-sign-v2.woff2",
    "anek-devanagari-label-v2.woff2",
  ]);
  // Nothing left over in public/fonts that no page loads.
  assert.deepEqual(readdirSync(join(web, "public/fonts")).sort(), [...files, "OFL.txt"].sort());
  for (const file of files) {
    const path = join(web, "public/fonts", file);
    assert.ok(existsSync(path), file);
    assert.ok(statSync(path).size < 128 * 1024, `${file} should stay under 128 KB`);
  }
  assert.match(readFileSync(join(web, "public/fonts/OFL.txt"), "utf8"), /SIL Open Font License/);
  const layout = readFileSync(join(web, "app/layout.tsx"), "utf8");
  assert.match(layout, /preload\("\/fonts\/anek-latin-v1\.woff2"/);
});

test("WEB-FONT-2: the Devanagari subset covers every Devanagari letter in the site's source", () => {
  const covered = new Set(readFileSync(join(web, "scripts/devanagari-text.txt"), "utf8"));
  const missing = new Set();
  for (const file of [...sources(join(web, "app")), ...sources(join(web, "lib"))]) {
    for (const ch of readFileSync(file, "utf8")) {
      if (/[ऀ-ॿ]/.test(ch) && !covered.has(ch)) missing.add(`${ch} (${file})`);
    }
  }
  assert.deepEqual([...missing], [], "run scripts/devanagari-text.mjs, then scripts/build_fonts.py");
});

test("WEB-FONT-3: the letter lists are what the dictionaries make; the label face holds only the option's name", () => {
  const text = readFileSync(join(web, "scripts/devanagari-text.txt"), "utf8");
  const label = readFileSync(join(web, "scripts/devanagari-label.txt"), "utf8");
  // Regenerate them and compare: a changed Hindi word needs a font build.
  execFileSync(process.execPath, [join(web, "scripts/devanagari-text.mjs")], { stdio: "ignore" });
  assert.equal(readFileSync(join(web, "scripts/devanagari-text.txt"), "utf8"), text, "devanagari-text.txt is stale");
  assert.equal(readFileSync(join(web, "scripts/devanagari-label.txt"), "utf8"), label, "devanagari-label.txt is stale");
  assert.equal(label.trim(), en.other.name);
  assert.ok(statSync(join(web, "public/fonts/anek-devanagari-label-v2.woff2")).size < 4 * 1024, "the label face stays tiny");
});
