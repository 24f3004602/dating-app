// SCN-4..9 (stage 21a, D119): the 3D route map's shapes and the interchange's hook.
// The shapes keep the SVG's face exactly; the hook links the rings and settles them
// in place. (The real engine run is checked in the browser, e2e motion.spec.ts; these
// cover the arithmetic. Node strips the types.)
import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPACT, TALL } from "../lib/routeMap.ts";
import { depthProfile, inBox, LOOK, ringCapsules, samplePath, stripMesh, UNIT } from "../lib/scene/geometry.ts";
import { atRest, control, HOOK, linking, restPoses, ringGap, startPose, tubeRadius } from "../lib/scene/hook.ts";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("a sampled path keeps its ends, follows its corner and never steps more than asked", () => {
  for (const line of [...COMPACT.lines, ...TALL.lines]) {
    const pts = samplePath(line.d, 3);
    const first = line.d[0];
    assert.deepEqual(pts[0], { x: first[1], y: first[2] });
    for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= 3 + 1e-9);
  }
  // The compact teal line's corner: Q 154 44 168 82 from (118, 44) passes (148.5, 53.5) halfway.
  const pts = samplePath(COMPACT.lines[0].d, 3);
  assert.ok(pts.some((p) => Math.hypot(p.x - 148.5, p.y - 53.5) < 3), "the curve is followed");
  assert.deepEqual(pts.at(-1), { x: 180, y: 116 });
});

test("lines that run off the box rise from flat at its edge; ends inside it are full depth", () => {
  // Phones: the teal line comes in from x = -24, its far end sits in the ring.
  const teal = samplePath(COMPACT.lines[0].d, 3);
  const depth = depthProfile(teal, COMPACT);
  teal.forEach((p, i) => {
    if (!inBox(p, COMPACT)) assert.equal(depth[i], 0);
    if (p.x <= 2) assert.ok(depth[i] < 0.01, `flat at the edge (x ${p.x})`);
    if (p.x >= LOOK.taper) assert.equal(depth[i], 1);
  });
  assert.equal(depth.at(-1), 1);
  // The joined rails run off the bottom (y 196 on phones, 470 on wide screens).
  for (const map of [COMPACT, TALL]) {
    for (const rail of map.rails) {
      const pts = samplePath(rail.d, 3);
      const d = depthProfile(pts, map);
      assert.equal(d[0], 1);
      pts.forEach((p, i) => {
        if (p.y >= map.height - 2) assert.ok(d[i] < 0.01, `flat at the bottom (y ${p.y})`);
      });
    }
  }
});

test("a strip's face is the SVG stroke, and every triangle faces the way its normal says", () => {
  const pts = samplePath(COMPACT.lines[0].d, 3);
  const mesh = stripMesh(pts, COMPACT.lineWidth, 0.3, depthProfile(pts, COMPACT));
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) assert.ok(p[i + 2] <= 1e-12 && p[i + 2] >= -0.3 - 1e-12, "between the face and the depth");
  // On the straight run (y = 44) the face spans 44 +/- 5 SVG units.
  const face = [];
  for (let i = 0; i < p.length; i += 3) {
    const n = mesh.normals.slice(i, i + 3);
    if (n[2] === 1 && p[i] * UNIT > 0 && p[i] * UNIT < 100) face.push(-p[i + 1] * UNIT);
  }
  assert.ok(face.length > 10);
  assert.ok(face.every((y) => close(y, 39, 1e-9) || close(y, 49, 1e-9)), "the face is the stroke's width");
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t + k] * 3);
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const n = mesh.normals.slice(a, a + 3);
    assert.ok(g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= -1e-12, `triangle ${t / 3} faces outwards`);
  }
});

test("the ring's capsules close the loop", () => {
  const caps = ringCapsules(24);
  assert.equal(caps.length, 24);
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    const n = caps[(i + 1) % caps.length];
    assert.ok(close(Math.hypot(c.center[0], c.center[1]), 1));
    const end = [c.center[0] - Math.sin(c.angle) * c.halfHeight, c.center[1] + Math.cos(c.angle) * c.halfHeight];
    const start = [n.center[0] + Math.sin(n.angle) * n.halfHeight, n.center[1] - Math.cos(n.angle) * n.halfHeight];
    assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.05, "neighbours meet within a thin tube");
  }
});

test("at rest the rings are hooked and clear of each other; the marigold ring starts unhooked above", () => {
  for (const map of [COMPACT, TALL]) {
    const { a, b } = restPoses(map);
    const tubes = 2 * tubeRadius(map);
    assert.equal(Math.abs(linking(a, b)), 1, "hooked like chain links");
    assert.ok(ringGap(a, b) > tubes + 0.3, "not touching at rest");
    const start = startPose(b);
    assert.equal(linking(a, start), 0, "it starts apart and has to drop through");
    assert.ok(close(start.position.y - b.position.y, HOOK.drop));
  }
});

test("the controller lets the ring fall until the catch, then springs it to its place with gravity faded", () => {
  const { b } = restPoses(COMPACT);
  const body = { position: { ...b.position, y: b.position.y - 0.5 }, velocity: { x: 0, y: -3, z: 0 }, rotation: b.rotation, spin: { x: 0, y: 0, z: 0 } };
  const falling = control(body, b, null);
  assert.deepEqual(falling.velocity, body.velocity);
  assert.equal(falling.gravityScale, 1);
  const caught = control(body, b, HOOK.ramp);
  assert.equal(caught.gravityScale, 0);
  assert.ok(caught.velocity.y > body.velocity.y, "pulled back up towards its place");
  const half = control(body, b, HOOK.ramp / 2);
  assert.ok(close(half.gravityScale, 0.5));
  const still = { position: b.position, velocity: { x: 0, y: 0, z: 0 }, rotation: b.rotation, spin: { x: 0, y: 0, z: 0 } };
  assert.equal(atRest(still, b), true);
  assert.deepEqual(control(still, b, 1).velocity, { x: 0, y: 0, z: 0 });
  assert.equal(atRest({ ...still, position: { ...b.position, y: b.position.y + 0.01 } }, b), false);
  assert.equal(atRest({ ...still, velocity: { x: 0, y: 0.1, z: 0 } }, b), false);
});
