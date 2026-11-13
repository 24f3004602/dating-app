// Lists the Devanagari the website shows (stage 22a, D120), for the font subsets that
// scripts/build_fonts.py builds: devanagari-text.txt holds every Hindi string on the
// Hindi page plus the working name in Devanagari; devanagari-label.txt holds only the
// language option's name, which the English page shows. Run from apps/web:
//   node scripts/devanagari-text.mjs
import { writeFileSync } from "node:fs";

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
writeFileSync(new URL("./devanagari-text.txt", import.meta.url), `${lines.join("\n")}\n`);
writeFileSync(new URL("./devanagari-label.txt", import.meta.url), `${en.other.name}\n`);
console.log(`devanagari-text.txt: ${lines.length} lines; devanagari-label.txt: ${en.other.name}`);
