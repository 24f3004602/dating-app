// Lists the Devanagari the website shows (stage 22a, D120), for the font subsets that
// scripts/build_fonts.py builds: devanagari-text.txt holds every Hindi string on the
// Hindi page plus the working name in Devanagari; devanagari-label.txt holds only the
// language option's name, which the English page shows. Run from apps/web:
//   node scripts/devanagari-text.mjs [output folder, default: this one]
// (WEB-FONT-3 writes into a temporary folder and compares, so a test run never changes these.)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { en } from "../lib/i18n/en.ts";
import { hi } from "../lib/i18n/hi.ts";

const NAME = "किनारा"; // the working name in Devanagari (BRAND_NAME_DEVANAGARI), when it's set
const strings = new Set();
const walk = (value) => {
  if (typeof value === "string") strings.add(value);
  else if (typeof value === "function") strings.add(value(NAME));
  else if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === "object") Object.values(value).forEach(walk);
};
walk(hi);
strings.add(NAME);
const lines = [...strings].filter((s) => /[ऀ-ॿ]/.test(s));
const out = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL("./", import.meta.url);
writeFileSync(new URL("devanagari-text.txt", out), `${lines.join("\n")}\n`);
writeFileSync(new URL("devanagari-label.txt", out), `${en.other.name}\n`);
console.log(`devanagari-text.txt: ${lines.length} lines; devanagari-label.txt: ${en.other.name}`);
