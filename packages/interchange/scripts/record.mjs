// Records the interchange's hook for the app's welcome (stage 21b, D122): the run the
// website's scene computes live (apps/web/app/hero3d/InterchangeScene.tsx), here in
// Node: Rapier with react-three-rapier's world settings, the same colliders, the same
// controller (src/hook.ts), 120 steps a second, kept at 60 frames a second.
// Usage (from the repo root): npm run record -w @datingapp/interchange
// Writes src/welcomeTrack.ts; tests/track.test.mjs runs it again and compares.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import RAPIER from "@dimforge/rapier3d-compat";

import { ringCapsules, UNIT } from "../src/geometry.ts";
import { atRest, control, HOOK, linking, restPoses, ringGap, startPose } from "../src/hook.ts";

/**
 * The app's rings (apps/mobile/src/ui/Rings.tsx), in ring radii: a ring is 0.6 of the
 * mark across with a stroke of 0.06 of it, so its centreline radius is 0.27 of the mark
 * and its tube 0.03; the centres rest 0.62 of a diameter apart. (The mark's size cancels.)
 */
export const WELCOME_RINGS = { tube: 0.03 / 0.27, apart: (0.62 * 0.6) / 0.27 };

const FPS = 60;
/** react-three-rapier's interaction groups: membership in the high 16 bits, the filter in the low. */
const groups = (member, filter) => (member << 16) | filter;
const A_GROUPS = groups(0b01, 0b10);
const B_SOLID = groups(0b10, 0b01);
const B_GHOST = groups(0b10, 0b00);

/** A map holding just the two rings, in map units (a ring radius is UNIT of them). */
export function ringsMap(rings) {
  return {
    rings: [
      { x: 0, y: 0 },
      { x: rings.apart * UNIT, y: 0 },
    ],
    ringRadius: UNIT,
    ringStroke: 2 * rings.tube * UNIT,
  };
}

/** Runs the hook once; returns the track and what happened. */
export async function record(rings = WELCOME_RINGS) {
  await RAPIER.init({});
  const map = ringsMap(rings);
  const rest = restPoses(map);
  const r = rings.tube;
  const world = new RAPIER.World({ x: 0, y: -HOOK.gravity, z: 0 });
  // react-three-rapier's <Physics> defaults (2.2.0), as the website's scene runs it.
  const ip = world.integrationParameters;
  ip.numSolverIterations = 4;
  ip.numInternalPgsIterations = 1;
  ip.normalizedAllowedLinearError = 0.001;
  ip.minIslandSize = 128;
  ip.maxCcdSubsteps = 1;
  ip.normalizedPredictionDistance = 0.002;
  ip.contact_natural_frequency = 30;
  world.lengthUnit = 1;
  world.timestep = HOOK.step;

  const addRing = (body, collisionGroups, friction, restitution) => {
    for (const c of ringCapsules(24)) {
      const desc = RAPIER.ColliderDesc.capsule(c.halfHeight, r)
        .setTranslation(...c.center)
        .setRotation({ x: 0, y: 0, z: Math.sin(c.angle / 2), w: Math.cos(c.angle / 2) })
        .setCollisionGroups(collisionGroups);
      if (friction !== undefined) desc.setFriction(friction);
      if (restitution !== undefined) desc.setRestitution(restitution);
      world.createCollider(desc, body);
    }
  };
  // Your ring, fixed (the scene gives it no friction or restitution of its own: Rapier's defaults).
  const a = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(rest.a.position.x, rest.a.position.y, rest.a.position.z)
      .setRotation(rest.a.rotation),
  );
  addRing(a, A_GROUPS);
  // Theirs, falling: friction 0.4, restitution 0.2, continuous collision detection, never asleep.
  const start = startPose(rest.b);
  const b = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.position.x, start.position.y, start.position.z)
      .setRotation(start.rotation)
      .setGravityScale(0)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  addRing(b, B_GHOST, 0.4, 0.2);

  const steps = [];
  const keep = () => steps.push({ position: b.translation(), rotation: b.rotation() });
  keep();
  const story = { steps: 0, solid: false, through: null, caught: null, rest: null, timedOut: false, worstGap: Infinity };
  for (;;) {
    // The scene's useBeforePhysicsStep, line for line.
    story.steps += 1;
    const t = story.steps * HOOK.step;
    const pose = { position: b.translation(), rotation: b.rotation() };
    if (!story.solid) {
      if (linking(rest.a, pose) !== 0 && ringGap(rest.a, pose) > 2 * r + 0.03) {
        story.solid = true;
        story.through = t;
        for (let i = 0; i < b.numColliders(); i++) b.collider(i).setCollisionGroups(B_SOLID);
      }
    } else {
      const gap = ringGap(rest.a, pose);
      story.worstGap = Math.min(story.worstGap, gap);
      if (story.caught === null && gap < 2 * r + 0.01) story.caught = t;
    }
    const now = { position: pose.position, velocity: b.linvel(), rotation: pose.rotation, spin: b.angvel() };
    if ((story.caught !== null && atRest(now, rest.b)) || t > HOOK.deadline) {
      story.rest = t;
      story.timedOut = t > HOOK.deadline;
      // Settled: put exactly in place, as the scene does.
      steps.push({ position: rest.b.position, rotation: rest.b.rotation });
      break;
    }
    const next = control(now, rest.b, story.caught === null ? null : t - story.caught);
    b.setGravityScale(next.gravityScale, true);
    b.setLinvel(next.velocity, true);
    b.setAngvel(next.spin, true);
    world.step();
    keep();
  }
  world.free();

  // Every other step (120 Hz to 60 frames a second); the last frame is the place itself.
  const per = Math.round(1 / HOOK.step / FPS);
  const kept = steps.filter((_, i) => i % per === 0 && i < steps.length - 1);
  kept.push(steps.at(-1));
  const round = (v) => Math.round(v * 1e4) / 1e4 + 0;
  const frames = kept.flatMap((s) => [
    round(s.position.x - rest.b.position.x),
    round(s.position.y - rest.b.position.y),
    round(s.position.z - rest.b.position.z),
    round(s.rotation.x),
    round(s.rotation.y),
    round(s.rotation.z),
    round(s.rotation.w),
  ]);
  const at = (t) => (t === null ? null : Math.round(t * 1e3) / 1e3);
  return {
    track: {
      rings: { tube: round(rings.tube), apart: round(rings.apart) },
      fps: FPS,
      frames,
      moments: { through: at(story.through), caught: at(story.caught), rest: at(story.rest) },
    },
    story: {
      ...story,
      linked: linking(rest.a, rest.b),
      restGap: ringGap(rest.a, rest.b),
      lowest: Math.min(...steps.map((s) => s.position.y - rest.b.position.y)),
    },
  };
}

/** The TypeScript module the app imports. */
export function trackSource(track) {
  const rows = [];
  for (let i = 0; i < track.frames.length; i += 7) rows.push(`    ${track.frames.slice(i, i + 7).join(", ")},`);
  return [
    "// The interchange's hook for the app's welcome, recorded from Rapier by scripts/record.mjs",
    "// (stage 21b, D122). Generated: run `npm run record -w @datingapp/interchange`; don't edit.",
    'import type { Track } from "./track.ts";',
    "",
    "export const WELCOME_TRACK: Track = {",
    `  rings: { tube: ${track.rings.tube}, apart: ${track.rings.apart} },`,
    `  fps: ${track.fps},`,
    `  moments: { through: ${track.moments.through}, caught: ${track.moments.caught}, rest: ${track.moments.rest} },`,
    "  // prettier-ignore",
    "  frames: [",
    ...rows,
    "  ],",
    "};",
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { track, story } = await record();
  writeFileSync(new URL("../src/welcomeTrack.ts", import.meta.url), trackSource(track));
  const d = (v) => v.toFixed(3);
  console.log(
    `through ${track.moments.through} s, caught ${track.moments.caught} s, at rest ${track.moments.rest} s` +
      `${story.timedOut ? " (TIMED OUT)" : ""}; ${track.frames.length / 7} frames; linked ${story.linked};` +
      ` rest gap ${d(story.restGap)} (touching under ${d(2 * WELCOME_RINGS.tube)});` +
      ` closest once solid ${d(story.worstGap)}; lowest ${d(story.lowest)} below its place`,
  );
}
