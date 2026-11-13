// MAP-1..3 (stage 21a, D119): the route map is data now, shared by the SVG and the 3D
// scene. It must draw exactly the map stage 20d drew (the station rails below line up
// with it), and the 3D scene's box must cover everything drawn. (Node strips the types.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { COMPACT, pathD, segments, TALL } from "../lib/routeMap.ts";

test("the paths are the ones stage 20d drew, to the unit", () => {
  assert.deepEqual(
    [...COMPACT.lines, ...COMPACT.rails].map((l) => [l.tone, pathD(l.d)]),
    [
      ["teal", "M -24 44 H 118 Q 154 44 168 82 L 180 116"],
      ["marigold", "M 424 80 H 286 Q 250 80 236 106 L 224 124"],
      ["teal", "M 191 150 V 214"],
      ["marigold", "M 205 150 V 214"],
    ],
  );
  assert.deepEqual(
    [...TALL.lines, ...TALL.rails].map((l) => [l.tone, pathD(l.d)]),
    [
      ["teal", "M 50 0 V 318"],
      ["marigold", "M 424 200 H 146 Q 84 200 68 262 L 59 304"],
      ["teal", "M 50 352 V 540"],
      ["marigold", "M 59 352 V 540"],
    ],
  );
});

test("the tall map's joined rails sit at 12.5% and 14.75% of its width, where the station rails are", () => {
  const xs = TALL.rails.map((r) => segments(r.d)[0].from.x / TALL.width);
  assert.deepEqual(xs, [0.125, 0.1475]);
  // ...and they reach the bottom of the drawn extent, where the stations take over.
  for (const rail of TALL.rails) assert.equal(segments(rail.d).at(-1).to.y, TALL.extent.maxY);
  const css = readFileSync(resolve(import.meta.dirname, "../app/landing.module.css"), "utf8");
  assert.match(css, /\.station::before \{ left: calc\(12\.5% - 0\.8%\)/);
  assert.match(css, /\.station::after \{ left: calc\(14\.75% - 0\.8%\)/);
});

test("segments turn H, V, L and Q into points; the extent holds every point, station and ring", () => {
  assert.deepEqual(segments([["M", 1, 2], ["H", 5], ["V", 9], ["L", 0, 0], ["Q", 3, 3, 6, 0]]), [
    { kind: "line", from: { x: 1, y: 2 }, to: { x: 5, y: 2 } },
    { kind: "line", from: { x: 5, y: 2 }, to: { x: 5, y: 9 } },
    { kind: "line", from: { x: 5, y: 9 }, to: { x: 0, y: 0 } },
    { kind: "quad", from: { x: 0, y: 0 }, control: { x: 3, y: 3 }, to: { x: 6, y: 0 } },
  ]);
  for (const map of [COMPACT, TALL]) {
    const { minX, maxX, minY, maxY } = map.extent;
    const inside = (p, pad = 0) => p.x - pad >= minX && p.x + pad <= maxX && p.y - pad >= minY && p.y + pad <= maxY;
    for (const line of [...map.lines, ...map.rails]) {
      for (const s of segments(line.d)) assert.ok(inside(s.from) && inside(s.to), `${line.tone} inside the extent`);
    }
    for (const s of map.stations) assert.ok(inside(s, map.stationRadius + map.stationStroke / 2));
    for (const r of map.rings) assert.ok(inside(r, map.ringRadius + map.ringStroke / 2));
  }
});
