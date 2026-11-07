/**
 * The tokens in code are the tokens the contrast checker reads
 * (`replica/design/tokens.json`), and every pair listed there passes WCAG AA.
 * Run `python3 .claude/skills/replica-design/contrast.py replica/design/tokens.json`
 * for the full report; this test keeps CI honest about both.
 */
import { color, focusRing, motion, overlay, radius, space, touch, type } from "@/theme/tokens";

import design from "../../../../replica/design/tokens.json";

type Spec = {
  color: Record<string, string>;
  pairs: [string, string, ("large" | "ui")?][];
  type: Record<string, { size: number; line: number; weight: number }>;
  space: number[];
  radius: Record<string, number>;
  touch: { min: number; chip: number };
  focus: { width: number; offset: number };
  motion: { duration: Record<string, number>; easing: Record<string, number[]>; rise: number; stagger: number };
  overlay: { opacity: number };
};
const spec = design as unknown as Spec;
const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test("the code's colours are the design file's colours, role for role", () => {
  expect(Object.fromEntries(Object.entries(spec.color).map(([k, v]) => [camel(k), v.toLowerCase()]))).toEqual(color);
});

test("every listed pair passes WCAG AA (4.5:1 text, 3:1 large text and UI parts)", () => {
  const failures = spec.pairs
    .map(([fg, bg, kind]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(spec.color[fg]!, spec.color[bg]!), need: kind ? 3 : 4.5 }))
    .filter((p) => p.ratio < p.need);
  expect(failures).toEqual([]);
  expect(spec.pairs.length).toBeGreaterThanOrEqual(20);
});

test("the type scale, spacing, radius, touch targets and focus ring match too", () => {
  for (const [name, t] of Object.entries(spec.type)) {
    expect(type[name as keyof typeof type]).toEqual({ fontSize: t.size, lineHeight: t.line, fontWeight: String(t.weight) });
  }
  expect(Object.values(space)).toEqual(spec.space.slice(1));
  expect(radius).toEqual(spec.radius);
  expect(touch).toEqual(spec.touch);
  expect(focusRing).toEqual({ width: spec.focus.width, offset: spec.focus.offset });
});

test("motion matches too, and no easing is linear", () => {
  const { _note: _ignored, ...rest } = spec.motion as typeof spec.motion & { _note?: string };
  expect(motion).toEqual(rest);
  for (const curve of Object.values(motion.easing)) {
    expect(curve).toHaveLength(4);
    expect(curve).not.toEqual([0, 0, 1, 1]); // linear
  }
  // Ambient loops stop within 5 seconds (WCAG 2.2.2): the rings breathe twice.
  expect(motion.duration.loop * 2).toBeLessThan(5000);
});

test("the overlay's floor is its colour at its opacity over white, so its pairs hold on any video", () => {
  expect(overlay.opacity).toBe(spec.overlay.opacity);
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  for (const i of [1, 3, 5]) {
    expect(channel(color.overlayFloor, i)).toBe(Math.round(overlay.opacity * channel(color.overlay, i) + (1 - overlay.opacity) * 255));
  }
});

test("the checker's arithmetic: known WCAG values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
});
