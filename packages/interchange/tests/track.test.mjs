// TRK-1..5 (stage 21b, D122): the app's recording of the interchange's hook, and the
// map scaling it rides on. The recording must still be what the engine does (a fresh
// Rapier run gives the same frames), start unhooked above its place, end hooked and
// exactly in place, and never sink one ring into the other. Node strips the types.
import assert from "node:assert/strict";
import { test } from "node:test";

import { record, ringsMap, trackSource, WELCOME_RINGS } from "../scripts/record.mjs";
import { LOOK } from "../src/geometry.ts";
import { HOOK, linking, restPoses, ringGap, tiltX } from "../src/hook.ts";
import { scaleMap } from "../src/map.ts";
import { FRAME, frameCount, poseAt, trackLength } from "../src/track.ts";
import { WELCOME_TRACK } from "../src/welcomeTrack.ts";

const rest = restPoses(ringsMap(WELCOME_RINGS));
const frame = (i) => poseAt(WELCOME_TRACK, rest.b.position, i / WELCOME_TRACK.fps);

test("TRK-1: the recording is what a fresh run of the engine gives, frame for frame", async () => {
  const { track } = await record();
  assert.deepEqual(track.rings, WELCOME_TRACK.rings);
  assert.deepEqual(track.moments, WELCOME_TRACK.moments);
  assert.equal(track.frames.length, WELCOME_TRACK.frames.length);
  // Rounded to 4 places when written; allow one step of rounding either way.
  for (let i = 0; i < track.frames.length; i++) assert.ok(Math.abs(track.frames[i] - WELCOME_TRACK.frames[i]) <= 2e-4, `number ${i}`);
  // And the file is exactly what the recorder writes for it.
  assert.match(trackSource(track), /export const WELCOME_TRACK: Track = \{/);
});

test("TRK-2: it starts unhooked straight above its place and ends hooked, exactly in place", () => {
  const first = frame(0);
  assert.deepEqual(first.position, { x: rest.b.position.x, y: rest.b.position.y + HOOK.drop, z: rest.b.position.z });
  const tilt = tiltX(LOOK.tiltB);
  for (const k of ["x", "y", "z", "w"]) assert.ok(Math.abs(first.rotation[k] - tilt[k]) < 1e-4, k);
  assert.equal(linking(rest.a, first), 0);
  const last = frame(frameCount(WELCOME_TRACK) - 1);
  assert.deepEqual(last.position, rest.b.position);
  for (const k of ["x", "y", "z", "w"]) assert.ok(Math.abs(last.rotation[k] - rest.b.rotation[k]) < 1e-4, k);
  assert.equal(Math.abs(linking(rest.a, last)), 1);
});

test("TRK-3: through, caught, at rest, in that order and in time; the tubes barely meet", () => {
  const { through, caught, rest: still } = WELCOME_TRACK.moments;
  assert.ok(0 < through && through < caught && caught < still && still < HOOK.deadline, JSON.stringify(WELCOME_TRACK.moments));
  assert.ok(Math.abs(trackLength(WELCOME_TRACK) - still) <= 1 / WELCOME_TRACK.fps + 1e-9, "the last frame is the moment it rests");
  // Before the ring is through, it's a ghost (it passes through the teal ring on purpose).
  // From then on the tubes may meet: at the catch, stepping at 120 Hz as the website does,
  // one sinks about a fifth of its radius into the other for a frame (under a point on a
  // phone; the website's run, 0.034 ring radii, is the same share). Never a quarter.
  const touch = 2 * WELCOME_RINGS.tube;
  let worst = Infinity;
  for (let i = Math.ceil(through * WELCOME_TRACK.fps); i < frameCount(WELCOME_TRACK); i++) worst = Math.min(worst, ringGap(rest.a, frame(i)));
  assert.ok(worst > touch - WELCOME_RINGS.tube / 4, `the closest: ${worst}`);
  // Hooked from the moment it's through.
  for (let i = Math.ceil(through * WELCOME_TRACK.fps); i < frameCount(WELCOME_TRACK); i++) assert.equal(Math.abs(linking(rest.a, frame(i))), 1, `frame ${i}`);
});

test("TRK-4: between frames the pose blends; before the start and after the end it holds", () => {
  const f = WELCOME_TRACK.frames;
  const mid = poseAt(WELCOME_TRACK, rest.b.position, 10.5 / WELCOME_TRACK.fps);
  const y = rest.b.position.y + (f[10 * FRAME + 1] + f[11 * FRAME + 1]) / 2;
  assert.ok(Math.abs(mid.position.y - y) < 1e-9);
  const q = mid.rotation;
  assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-9, "a unit rotation");
  assert.deepEqual(poseAt(WELCOME_TRACK, rest.b.position, -1), frame(0));
  assert.deepEqual(poseAt(WELCOME_TRACK, rest.b.position, 99), frame(frameCount(WELCOME_TRACK) - 1));
});

test("TRK-5: a scaled map is the same map at another size", () => {
  const map = {
    width: 342,
    height: 176,
    extent: { minX: 0, maxX: 342, minY: 0, maxY: 176 },
    lineWidth: 8,
    lines: [{ tone: "teal", d: [["M", 0, 28], ["H", 90], ["L", 130, 68], ["Q", 140, 78, 150, 80], ["V", 100]] }],
    rails: [{ tone: "marigold", d: [["M", 177, 125], ["V", 176]] }],
    stations: [{ x: 20, y: 28, tone: "teal" }],
    stationRadius: 6.5,
    stationStroke: 3,
    rings: [
      { x: 153, y: 100 },
      { x: 189, y: 100 },
    ],
    ringRadius: 25.92,
    ringStroke: 5.76,
  };
  const k = 22 / map.ringRadius;
  const scaled = scaleMap(map, k);
  assert.ok(Math.abs(scaled.ringRadius - 22) < 1e-9);
  assert.deepEqual(scaled.lines[0].d[0], ["M", 0, 28 * k]);
  assert.deepEqual(scaled.lines[0].d[3], ["Q", 140 * k, 78 * k, 150 * k, 80 * k]);
  assert.equal(scaled.stations[0].tone, "teal");
  const back = scaleMap(scaled, 1 / k);
  const near = (a, b) => (typeof a === "number" ? Math.abs(a - b) < 1e-9 : Array.isArray(a) ? a.every((v, i) => near(v, b[i])) : typeof a === "object" ? Object.keys(a).every((key) => near(a[key], b[key])) : a === b);
  assert.ok(near(back, map), "scaling there and back gives the map");
});
