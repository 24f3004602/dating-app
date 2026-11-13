/**
 * The 3D route map's shapes, built from the same data as the SVG (lib/routeMap.ts;
 * stage 21a, D119). World units: one unit is the ring radius (22 SVG units), y points
 * up. The map's face stays at z = 0, exactly where the SVG draws it, so the page's
 * words and the station rails below still line up; depth runs back from it. Pure
 * arithmetic (no three.js), so it's unit-tested (tests/sceneGeometry.test.mjs).
 */
import { type Cmd, type MapLayout, type Point, segments } from "../routeMap.ts";

/** SVG units per world unit: the interchange rings' radius. */
export const UNIT = 22;

/** The scene's fixed choices (D119), tuned by eye in the preview at phone and desktop sizes. */
export const LOOK = {
  /** How far the lines run back from the map's face (world units). */
  depth: 0.6,
  /** How far the station studs stand out from the line's face. */
  stud: 0.15,
  /** Lines that run off the box rise from flat over this many SVG units. */
  taper: 70,
  /** The rings' centres stand this far in front of the map's face. */
  ringZ: 0.9,
  /** The rings' tilts about the line between their centres: 90 degrees apart, like chain links. */
  tiltA: (30 * Math.PI) / 180,
  tiltB: (-60 * Math.PI) / 180,
  /**
   * The view: an oblique projection that keeps the map's face exactly where the SVG
   * draws it and shows depth by moving deeper points right and up, as if seen from
   * above and to the right. `pointer` is how far the pointer can tilt it.
   */
  shear: { x: -0.32, y: -0.42 },
  pointer: 0.16,
} as const;

export type Vec3 = [number, number, number];

/** An SVG point in world units (y flipped). */
export function toWorld(p: Point, z = 0): Vec3 {
  return [p.x / UNIT, -p.y / UNIT, z];
}

/** Points along a path, at most `step` SVG units apart, ends included; quadratic corners are followed. */
export function samplePath(d: Cmd[], step = 3): Point[] {
  const out: Point[] = [];
  for (const s of segments(d)) {
    if (out.length === 0) out.push(s.from);
    if (s.kind === "line") {
      const n = Math.max(1, Math.ceil(Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) / step));
      for (let i = 1; i <= n; i++) out.push({ x: s.from.x + ((s.to.x - s.from.x) * i) / n, y: s.from.y + ((s.to.y - s.from.y) * i) / n });
    } else {
      // The curve moves at most 2 x its longer control leg per unit of t, so `n` keeps every step within `step`.
      const fastest = 2 * Math.max(Math.hypot(s.control.x - s.from.x, s.control.y - s.from.y), Math.hypot(s.to.x - s.control.x, s.to.y - s.control.y));
      const n = Math.max(2, Math.ceil(fastest / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        out.push({ x: a * s.from.x + b * s.control.x + c * s.to.x, y: a * s.from.y + b * s.control.y + c * s.to.y });
      }
    }
  }
  return out;
}

/** Inside the SVG's own box (the canvas covers exactly that box). */
export function inBox(p: Point, map: MapLayout): boolean {
  return p.x > 0 && p.x < map.width && p.y > 0 && p.y < map.height;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * How deep the line is at each point, 0..1. A line that runs off the box (where the
 * flat SVG carries it on) rises from flat at the box's edge over `taper` SVG units, so
 * the two meet without a step; an end inside the box is full depth. A short line (the
 * phone map's joined rails) rises over its whole length instead, so it is still full
 * depth where it meets the rings.
 */
export function depthProfile(points: Point[], map: MapLayout, taper: number = LOOK.taper): number[] {
  const along: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  }
  const total = along.at(-1)!;
  const startFree = !inBox(points[0]!, map);
  const endFree = !inBox(points.at(-1)!, map);
  // Where a free end crosses the box's edge, measured along the line.
  const enter = startFree ? crossing(points, along, map, 1) : 0;
  const leave = endFree ? crossing(points, along, map, -1) : total;
  const ramp = Math.min(taper, (leave - enter) / (startFree && endFree ? 2 : 1));
  return points.map((p, i) => {
    if (!inBox(p, map)) return 0;
    const fromStart = startFree ? smooth((along[i]! - enter) / ramp) : 1;
    const fromEnd = endFree ? smooth((leave - along[i]!) / ramp) : 1;
    return Math.min(fromStart, fromEnd);
  });
}

/** The distance along the line where it first (dir 1) or last (dir -1) is inside the box, interpolated to the edge. */
function crossing(points: Point[], along: number[], map: MapLayout, dir: 1 | -1): number {
  const order = points.map((_, i) => i);
  if (dir === -1) order.reverse();
  const k = order.findIndex((i) => inBox(points[i]!, map));
  if (k <= 0) return along[order[Math.max(0, k)]!]!;
  const inside = order[k]!;
  const outside = order[k - 1]!;
  // Bisect the segment for the edge (the box is convex, so there is one crossing).
  let lo = 0;
  let hi = 1;
  const at = (t: number) => ({
    x: points[outside]!.x + (points[inside]!.x - points[outside]!.x) * t,
    y: points[outside]!.y + (points[inside]!.y - points[outside]!.y) * t,
  });
  for (let n = 0; n < 30; n++) {
    const mid = (lo + hi) / 2;
    if (inBox(at(mid), map)) hi = mid;
    else lo = mid;
  }
  return along[outside]! + (along[inside]! - along[outside]!) * hi;
}

export type MeshData = { positions: number[]; normals: number[]; indices: number[] };

/**
 * A line as a solid strip: its face at z = 0 is the SVG's stroke (same width, same
 * path, butt ends) and its sides run back to z = -depth x profile. Every triangle
 * faces outwards.
 */
export function stripMesh(points: Point[], width: number, depth: number, profile: number[]): MeshData {
  const mesh: MeshData = { positions: [], normals: [], indices: [] };
  const n = points.length;
  const half = width / 2;
  // Mitred offsets: the mean of the neighbouring segments' normals, lengthened to keep the width.
  const left: Point[] = [];
  const right: Point[] = [];
  const side: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[i]!;
    const c = points[Math.min(n - 1, i + 1)]!;
    const n1 = normalOf(a, b) ?? normalOf(b, c)!;
    const n2 = normalOf(b, c) ?? n1;
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const scale = half / Math.max(0.5, mx * n1.x + my * n1.y);
    left.push({ x: b.x + mx * scale, y: b.y + my * scale });
    right.push({ x: b.x - mx * scale, y: b.y - my * scale });
    side.push({ x: mx, y: my });
  }
  const z = (i: number) => -depth * profile[i]!;
  for (let i = 0; i + 1 < n; i++) {
    quad(mesh, toWorld(left[i]!), toWorld(right[i]!), toWorld(right[i + 1]!), toWorld(left[i + 1]!), [0, 0, 1]);
  }
  for (let i = 0; i + 1 < n; i++) {
    const outL: Vec3 = [side[i]!.x, -side[i]!.y, 0];
    quad(mesh, toWorld(left[i]!), toWorld(left[i + 1]!), toWorld(left[i + 1]!, z(i + 1)), toWorld(left[i]!, z(i)), outL);
    const outR: Vec3 = [-side[i]!.x, side[i]!.y, 0];
    quad(mesh, toWorld(right[i]!), toWorld(right[i + 1]!), toWorld(right[i + 1]!, z(i + 1)), toWorld(right[i]!, z(i)), outR);
  }
  for (const [i, j] of [
    [0, 1],
    [n - 1, n - 2],
  ] as const) {
    if (profile[i]! <= 0) continue;
    const t = { x: points[i]!.x - points[j]!.x, y: points[i]!.y - points[j]!.y };
    const l = Math.hypot(t.x, t.y) || 1;
    quad(mesh, toWorld(left[i]!), toWorld(right[i]!), toWorld(right[i]!, z(i)), toWorld(left[i]!, z(i)), [t.x / l, -t.y / l, 0]);
  }
  return mesh;
}

function normalOf(a: Point, b: Point): Point | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return l < 1e-9 ? null : { x: -dy / l, y: dx / l };
}

/** Adds a flat quad, wound so that its front faces `normal`; degenerate quads are skipped. */
function quad(mesh: MeshData, a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ad = sub(d, a);
  const area = Math.hypot(...cross(ab, ac)) + Math.hypot(...cross(ac, ad));
  if (area < 1e-10) return;
  const base = mesh.positions.length / 3;
  for (const p of [a, b, c, d]) {
    mesh.positions.push(...p);
    mesh.normals.push(...normal);
  }
  const facing = dot(cross(ab, ac), normal) + dot(cross(ac, ad), normal) >= 0;
  if (facing) mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else mesh.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * A ring's collision shape: capsules along its centreline (radius 1, in its local XY
 * plane), since the physics engine has no torus. A capsule's axis is its local Y,
 * turned about Z by `angle` to follow the ring.
 */
export function ringCapsules(count: number): { center: Vec3; halfHeight: number; angle: number }[] {
  const out: { center: Vec3; halfHeight: number; angle: number }[] = [];
  for (let i = 0; i < count; i++) {
    const mid = ((i + 0.5) / count) * Math.PI * 2;
    out.push({ center: [Math.cos(mid), Math.sin(mid), 0], halfHeight: Math.sin(Math.PI / count), angle: mid });
  }
  return out;
}
