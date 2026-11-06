import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { tokensCss } from "../scripts/tokens-css.mjs";

const root = resolve(import.meta.dirname, "..");

test("app/tokens.css is generated from the current design tokens", () => {
  const spec = JSON.parse(readFileSync(resolve(root, "../../replica/design/tokens.json"), "utf8"));
  assert.equal(readFileSync(resolve(root, "app/tokens.css"), "utf8"), tokensCss(spec));
});

test("motion tokens become durations and cubic-bezier curves", () => {
  const css = tokensCss({
    color: {}, type: {}, space: [0], radius: {}, touch: { min: 48, chip: 44 }, focus: { width: 2, offset: 2 },
    motion: { duration: { fast: 150 }, easing: { standard: [0.2, 0, 0, 1] }, rise: 8, stagger: 50 },
  });
  assert.match(css, /--motion-fast: 150ms;/);
  assert.match(css, /--ease-standard: cubic-bezier\(0\.2, 0, 0, 1\);/);
  assert.match(css, /--motion-rise: 0\.5rem;/);
  assert.match(css, /--motion-stagger: 50ms;/);
});

test("every colour role becomes a custom property", () => {
  const css = tokensCss({ color: { accent: "#0e6670" }, type: {}, space: [0, 4], radius: {}, touch: { min: 48, chip: 44 }, focus: { width: 2, offset: 2 } });
  assert.match(css, /--color-accent: #0e6670;/);
  assert.match(css, /--space-1: 0.25rem;/);
});
