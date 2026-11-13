/**
 * The interchange's hook as a recording (stage 21b, D122). The website runs the physics
 * live (Rapier, in WebAssembly); the app plays a recording of the same run instead: the
 * same engine and settings, the same colliders and the same controller (hook.ts),
 * stepped at 120 Hz and kept at 60 frames a second. Nobody touches the rings, so the run
 * is the same every time and a recording of it moves exactly as the live one would,
 * with no engine on the phone. Made by scripts/record.mjs; this package's tests check it
 * still matches a fresh run.
 */
import type { Pose, Vec } from "./hook.ts";

export type Track = {
  /** The rings it was recorded for, in ring radii: the tube's radius, and how far apart their centres rest. */
  rings: { tube: number; apart: number };
  /** Frames per second. */
  fps: number;
  /**
   * Seven numbers a frame, for the marigold ring: its offset from its place (x, y, z), then
   * its rotation as a quaternion (x, y, z, w). The first frame is where it starts, the last
   * exactly its place.
   */
  frames: number[];
  /** Seconds from the start: through the teal ring (when collisions come on), caught on it, at rest. */
  moments: { through: number; caught: number; rest: number };
};

/** Numbers per frame. */
export const FRAME = 7;

/** The number of frames. */
export function frameCount(track: Track): number {
  return Math.floor(track.frames.length / FRAME);
}

/** How long it runs, in seconds: the time of the last frame. */
export function trackLength(track: Track): number {
  return (frameCount(track) - 1) / track.fps;
}

/**
 * The marigold ring's pose `t` seconds in, given its place (the rest position). Between
 * two frames the position blends and the rotation turns the short way; before the start
 * it is at the start, after the end exactly in place.
 */
export function poseAt(track: Track, place: Vec, t: number): Pose {
  const last = frameCount(track) - 1;
  const at = Math.min(last, Math.max(0, t * track.fps));
  const i = Math.min(last, Math.floor(at));
  const j = Math.min(last, i + 1);
  const k = at - i;
  const f = track.frames;
  const a = i * FRAME;
  const b = j * FRAME;
  const mix = (n: number) => f[a + n]! + (f[b + n]! - f[a + n]!) * k;
  // The short way round: q and -q are the same rotation.
  const same = f[a + 3]! * f[b + 3]! + f[a + 4]! * f[b + 4]! + f[a + 5]! * f[b + 5]! + f[a + 6]! * f[b + 6]! >= 0 ? 1 : -1;
  const turn = (n: number) => f[a + n]! + (same * f[b + n]! - f[a + n]!) * k;
  const q = { x: turn(3), y: turn(4), z: turn(5), w: turn(6) };
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return {
    position: { x: place.x + mix(0), y: place.y + mix(1), z: place.z + mix(2) },
    rotation: { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len },
  };
}
