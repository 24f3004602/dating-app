// Writes app/tokens.css from replica/design/tokens.json (the design system's
// source of truth, contrast-checked). Run by `build` and `dev`; tests/tokens.test.mjs
// fails if the committed file is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../replica/design/tokens.json");
const target = resolve(here, "../app/tokens.css");

export function tokensCss(spec) {
  const lines = ["/* Generated from replica/design/tokens.json by scripts/tokens-css.mjs. Do not edit. */", ":root {"];
  for (const [role, hex] of Object.entries(spec.color)) lines.push(`  --color-${role}: ${hex};`);
  for (const [name, t] of Object.entries(spec.type)) {
    lines.push(`  --type-${name}-size: ${t.size / 16}rem;`, `  --type-${name}-line: ${t.line / t.size};`, `  --type-${name}-weight: ${t.weight};`);
  }
  spec.space.forEach((v, i) => lines.push(`  --space-${i}: ${v / 16}rem;`));
  for (const [name, v] of Object.entries(spec.radius)) lines.push(`  --radius-${name}: ${v}px;`);
  lines.push(`  --touch-min: ${spec.touch.min / 16}rem;`, `  --touch-chip: ${spec.touch.chip / 16}rem;`);
  lines.push(`  --focus-width: ${spec.focus.width}px;`, `  --focus-offset: ${spec.focus.offset}px;`, "}", "");
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(target, tokensCss(JSON.parse(readFileSync(source, "utf8"))), "utf8");
  console.log("wrote app/tokens.css");
}
