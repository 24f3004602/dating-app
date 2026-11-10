// WEB-FONT-1..2 (stage 20d, D101): the self-hosted Anek files exist, and the Devanagari
// subset covers every Devanagari letter the site's source shows.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

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
  assert.deepEqual(files, ["anek-latin-v1.woff2", "anek-devanagari-v1.woff2"]);
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
  assert.deepEqual([...missing], [], "add these to scripts/devanagari-text.txt and run scripts/build_fonts.py");
});
