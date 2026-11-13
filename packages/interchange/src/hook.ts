/**
 * The interchange's moment (stage 21a, D119): your ring (teal) is fixed; theirs
 * (marigold) drops through it, hooks like a chain link, swings and settles. The
 * physics engine (Rapier) moves the marigold ring and stops it on the teal one; these
 * functions are the rest of the story, kept free of the engine so they're unit-tested
 * (the website's tests/scene.test.mjs) and the same numbers drive the website's scene
 * (live, in Rapier) and the app's (a recording of the same run: track.ts, D122).
 *
 * The story, in physics steps of 1/120 s (at 1/60 s the catch, at about 8 ring radii
 * a second, sank 0.12 radii into the teal ring before the contact caught it):
 *  1. The marigold ring starts above its place and falls. It passes through the teal
 *     ring (collisions off: closed rings can't link any other way), so it is linked.
 *  2. Once it's clear of the teal ring, collisions come on. It keeps falling until it
 *     catches on the teal ring: the hook.
 *  3. From the catch, a spring pulls it back to its place while its gravity fades out,
 *     and it swings to rest. Settled: it's put exactly in place and the engine stops.
 *
 * Gravity is faded through the body's gravity scale, not cancelled by adding velocity:
 * Rapier integrates in substeps, so a ring held still by a counter-velocity would
 * still report a speed of g x dt and never look at rest.
 */

import type { MapLayout } from "./map.ts";
import { LOOK, UNIT } from "./geometry.ts";

export type Vec = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type Pose = { position: Vec; rotation: Quat };

export const HOOK = {
  /** World units: the ring radius is 1. */
  gravity: 14,
  /** How far above its place the marigold ring starts. */
  drop: 2.2,
  /** The spring back to the place after the catch: its frequency (Hz) and damping ratio. */
  hz: 1.1,
  zeta: 0.42,
  /** The spring that keeps the ring's tilt. */
  turnHz: 1.4,
  turnZeta: 0.5,
  /** Seconds over which the spring comes on after the catch. */
  ramp: 0.25,
  /** Never later than this, whatever happens (seconds from the start). */
  deadline: 4.5,
  step: 1 / 120,
} as const;

/**
 * Where the rings rest: in front of the map's face, placed so that seen through the
 * resting view they sit exactly on the SVG's rings.
 */
export function restPoses(map: MapLayout): { a: Pose; b: Pose } {
  const at = (p: { x: number; y: number }) => ({
    x: p.x / UNIT - LOOK.shear.x * LOOK.ringZ,
    y: -p.y / UNIT - LOOK.shear.y * LOOK.ringZ,
    z: LOOK.ringZ,
  });
  return {
    a: { position: at(map.rings[0]), rotation: tiltX(LOOK.tiltA) },
    b: { position: at(map.rings[1]), rotation: tiltX(LOOK.tiltB) },
  };
}

/** Where the marigold ring starts: straight above its place. */
export function startPose(rest: Pose): Pose {
  return { position: { ...rest.position, y: rest.position.y + HOOK.drop }, rotation: rest.rotation };
}

/** The tube radius of the map's rings, in world units. */
export function tubeRadius(map: MapLayout): number {
  return map.ringStroke / 2 / UNIT;
}

/** A rotation about the world X axis (the line between the two rings' centres). */
export function tiltX(radians: number): Quat {
  return { x: Math.sin(radians / 2), y: 0, z: 0, w: Math.cos(radians / 2) };
}

/** A point of a ring (radius 1, in its local XY plane) placed by a pose. */
export function ringPoint(pose: Pose, angle: number): Vec {
  return add(pose.position, rotate(pose.rotation, { x: Math.cos(angle), y: Math.sin(angle), z: 0 }));
}

/** The closest the two rings' centrelines come (sampled); the tubes touch when it's under the two tube radii. */
export function ringGap(a: Pose, b: Pose, samples = 48): number {
  const pa = Array.from({ length: samples }, (_, i) => ringPoint(a, (i / samples) * Math.PI * 2));
  const pb = Array.from({ length: samples }, (_, i) => ringPoint(b, (i / samples) * Math.PI * 2));
  let best = Infinity;
  for (const p of pa) for (const q of pb) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  return best;
}

/**
 * The linking number of the two rings: 0 apart, +1 or -1 hooked. Counted as the
 * signed crossings of ring B through the disc of ring A.
 */
export function linking(a: Pose, b: Pose, samples = 192): number {
  const normal = rotate(a.rotation, { x: 0, y: 0, z: 1 });
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const p = ringPoint(b, (i / samples) * Math.PI * 2);
    const q = ringPoint(b, ((i + 1) / samples) * Math.PI * 2);
    const dp = dot(sub(p, a.position), normal);
    const dq = dot(sub(q, a.position), normal);
    if (dp === dq || Math.sign(dp) === Math.sign(dq)) continue;
    const t = dp / (dp - dq);
    const hit = add(p, scale(sub(q, p), t));
    if (Math.hypot(...Object.values(sub(hit, a.position))) < 1) total += Math.sign(dq - dp);
  }
  return total;
}

/**
 * The velocities and gravity scale to set before the next step. Before the catch only
 * the tilt is held (the ring falls freely); from the catch the spring ramps in as
 * gravity fades out, so the ring comes to rest exactly at `target`.
 */
export function control(
  body: { position: Vec; velocity: Vec; rotation: Quat; spin: Vec },
  target: Pose,
  sinceCatch: number | null,
): { velocity: Vec; spin: Vec; gravityScale: number } {
  const dt = HOOK.step;
  let velocity = body.velocity;
  let gravityScale = 1;
  if (sinceCatch !== null) {
    const on = Math.min(1, sinceCatch / HOOK.ramp);
    const w = 2 * Math.PI * HOOK.hz;
    const pull = sub(target.position, body.position);
    const accel = sub(scale(pull, w * w), scale(body.velocity, 2 * HOOK.zeta * w));
    velocity = add(body.velocity, scale(accel, dt * on));
    gravityScale = 1 - on;
  }
  const wr = 2 * Math.PI * HOOK.turnHz;
  const turn = rotationVector(mul(target.rotation, conj(body.rotation)));
  const spinAccel = sub(scale(turn, wr * wr), scale(body.spin, 2 * HOOK.turnZeta * wr));
  return { velocity, spin: add(body.spin, scale(spinAccel, dt)), gravityScale };
}

/** At rest in its place: close enough to put it there exactly without anyone seeing a jump. */
export function atRest(body: { position: Vec; velocity: Vec; rotation: Quat; spin: Vec }, target: Pose): boolean {
  const off = Math.hypot(...Object.values(sub(body.position, target.position)));
  const turned = Math.hypot(...Object.values(rotationVector(mul(target.rotation, conj(body.rotation)))));
  const moving = Math.hypot(...Object.values(body.velocity));
  const spinning = Math.hypot(...Object.values(body.spin));
  return off < 0.006 && turned < 0.006 && moving < 0.03 && spinning < 0.05;
}

// --- Small vector and quaternion helpers -----------------------------------------

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;

export function mul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function rotate(q: Quat, v: Vec): Vec {
  const p = mul(mul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), conj(q));
  return { x: p.x, y: p.y, z: p.z };
}

/** A rotation as axis x angle (the short way round). */
function rotationVector(q: Quat): Vec {
  const s = q.w < 0 ? -1 : 1;
  const w = Math.min(1, Math.abs(q.w));
  const angle = 2 * Math.acos(w);
  const sin = Math.sqrt(Math.max(0, 1 - w * w));
  if (sin < 1e-9) return { x: 0, y: 0, z: 0 };
  return scale({ x: q.x * s, y: q.y * s, z: q.z * s }, angle / sin);
}
