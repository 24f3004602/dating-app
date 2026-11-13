"use client";

/**
 * The first screen's route map in 3D (stage 21a, D119; the owner's direction "Rings
 * that hook"). Loaded only after the page shows, and only for visitors who haven't
 * asked for less (lib/heroScene.ts); the flat SVG stays the picture until the first
 * frames are drawn and comes back if anything fails.
 *
 * What happens: the map's lines rise into depth while the marigold ring (theirs) drops
 * through the teal one (yours), catches like a chain link, swings and settles, in
 * about three seconds. Then nothing moves, except the view tilting a little with a
 * mouse. Crisp and flat, like the signs: flat colour in three tones, graphite outlines
 * from postprocessing, no glow.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { CapsuleCollider, interactionGroups, Physics, type RapierRigidBody, RigidBody, useBeforePhysicsStep } from "@react-three/rapier";
import { BlendFunction } from "postprocessing";
import { type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Euler, type Group, type Mesh, Quaternion, TorusGeometry } from "three";

import type { MapLayout } from "@/lib/routeMap";
import { LOOK, ringCapsules, UNIT } from "@datingapp/interchange/geometry";
import { atRest, control, HOOK, linking, type Pose, restPoses, ringGap, startPose, tubeRadius } from "@datingapp/interchange/hook";
import { LIGHT, lineGeometry, type Materials, type SceneColors, stationShapes, toonMaterials } from "@datingapp/interchange/meshes";

import { ObliqueCamera } from "@datingapp/interchange/oblique-camera";

/** The page's own colours, read from its CSS so the scene matches the SVG exactly. */
export type { SceneColors };

export type SceneProps = {
  map: MapLayout;
  colors: SceneColors;
  /** Start at rest: it has played already (the layout changed across the breakpoint). */
  still: boolean;
  /** A mouse (a fine pointer that hovers) can tilt the view a little. */
  tilt: boolean;
  /** Two frames are drawn and they match the flat map: the canvas can be shown. */
  onReady: () => void;
  /** The rings are at rest; nothing moves until the pointer does. */
  onSettled: () => void;
  /** The WebGL context was lost: back to the flat map. */
  onLost: () => void;
};

const A_GROUPS = interactionGroups(0, [1]);
const B_SOLID = interactionGroups(1, [0]);
const B_GHOST = interactionGroups(1, []);
const CAPSULES = ringCapsules(24);
/** Seconds: the map lifts into depth over LIFT, and the rings fade in over the flat ones over FADE. */
const LIFT = 0.9;
const FADE = 0.25;
const ZERO = { x: 0, y: 0, z: 0 };

export function InterchangeScene(props: SceneProps) {
  const { map } = props;
  const lost = useLostContext(props.onLost);
  const camera = useMemo(() => {
    const cam = new ObliqueCamera(0, map.width / UNIT, 0, -map.height / UNIT, 0.1, 40);
    cam.position.set(0, 0, 20);
    cam.updateProjectionMatrix();
    return cam;
  }, [map]);
  const [settled, setSettled] = useState(props.still);
  return (
    <Canvas
      camera={camera}
      flat
      dpr={[1, 2]}
      frameloop={settled ? "demand" : "always"}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "low-power" }}
      onCreated={({ gl }) => lost.watch(gl.domElement)}
    >
      <Suspense fallback={null}>
        <Interchange
          {...props}
          camera={camera}
          settled={settled}
          onSettled={() => {
            setSettled(true);
            props.onSettled();
          }}
        />
      </Suspense>
    </Canvas>
  );
}

/**
 * A lost GPU context brings the flat map back. The renderer's own disposal on unmount
 * loses its context on purpose too (React Three Fiber calls forceContextLoss), which
 * once sent the map flat when the layout crossed the breakpoint; so only the live scene
 * listens, and its listener goes when it unmounts.
 */
function useLostContext(onLost: () => void) {
  const report = useRef(onLost);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const live = useRef(false);
  useEffect(() => {
    report.current = onLost;
  });
  const handle = useCallback(() => {
    if (live.current) report.current();
  }, []);
  useEffect(() => {
    live.current = true;
    canvas.current?.addEventListener("webglcontextlost", handle);
    return () => {
      live.current = false;
      canvas.current?.removeEventListener("webglcontextlost", handle);
    };
  }, [handle]);
  return {
    watch: (element: HTMLCanvasElement) => {
      canvas.current = element;
      element.addEventListener("webglcontextlost", handle);
    },
  };
}

function Interchange({
  map,
  colors,
  still,
  tilt,
  onReady,
  onSettled,
  camera,
  settled,
}: SceneProps & { camera: ObliqueCamera; settled: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const materials = useMaterials(colors);
  const rest = useMemo(() => restPoses(map), [map]);
  const torus = useMemo(() => new TorusGeometry(1, tubeRadius(map), 20, 128), [map]);
  const rings = useRef<Group>(null);
  const ringA = useRef<Mesh>(null);
  const ringB = useRef<Mesh>(null);
  const body = useRef<RapierRigidBody>(null);
  const started = useRef(false);
  const clock = useRef({ frames: 0, start: -1 });
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    if (!tilt) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      pointer.current.ty = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      invalidate();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [tilt, invalidate]);

  useFrame((state, delta) => {
    const c = clock.current;
    c.frames += 1;
    // At rest (on demand) nothing else asks for frames: ask until the two that show the canvas.
    if (c.frames < 3) invalidate();
    if (c.frames === 2) onReady();
    if (c.frames > 2 && c.start < 0) {
      c.start = state.clock.elapsedTime;
      started.current = true;
    }
    const t = c.start < 0 ? 0 : state.clock.elapsedTime - c.start;
    const lift = still ? 1 : easeOutExpo(Math.min(1, t / LIFT));
    const fade = still ? 1 : Math.min(1, t / FADE);
    const p = pointer.current;
    const follow = 1 - Math.exp(-Math.min(delta, 0.1) * 6);
    p.x += (p.tx - p.x) * follow;
    p.y += (p.ty - p.y) * follow;
    const sx = (LOOK.shear.x - LOOK.pointer * p.x) * lift;
    const sy = (LOOK.shear.y + LOOK.pointer * p.y) * lift;
    camera.setShear(sx, sy);
    // The rings stay on the flat map's rings whatever the view.
    rings.current?.position.set((LOOK.shear.x - sx) * LOOK.ringZ, (LOOK.shear.y - sy) * LOOK.ringZ, 0);
    materials.ringTeal.opacity = fade;
    materials.ringMarigold.opacity = fade;
    materials.ringTeal.transparent = fade < 1;
    materials.ringMarigold.transparent = fade < 1;
    const b = body.current;
    if (!settled && b && ringB.current) {
      const at = b.translation();
      const turn = b.rotation();
      ringB.current.position.set(at.x, at.y, at.z);
      ringB.current.quaternion.set(turn.x, turn.y, turn.z, turn.w);
    }
    if (settled && (Math.abs(p.tx - p.x) > 1e-3 || Math.abs(p.ty - p.y) > 1e-3)) invalidate();
  });

  const start = startPose(rest.b);
  const b0 = settled ? rest.b : start;
  return (
    <>
      <color attach="background" args={[colors.ground]} />
      <ambientLight intensity={LIGHT.ambient} />
      <directionalLight intensity={LIGHT.directional} position={LIGHT.direction} />
      <Lines map={map} materials={materials} />
      <Stations map={map} materials={materials} />
      <group ref={rings}>
        <mesh ref={ringA} geometry={torus} material={materials.ringTeal} position={vec(rest.a)} quaternion={quat(rest.a)} />
        <mesh ref={ringB} geometry={torus} material={materials.ringMarigold} position={vec(b0)} quaternion={quat(b0)} />
      </group>
      {settled ? null : (
        <Physics timeStep={HOOK.step} gravity={[0, -HOOK.gravity, 0]} colliders={false}>
          <Hook map={map} rest={rest} body={body} started={started} onAtRest={onSettled} />
        </Physics>
      )}
      <EffectComposer multisampling={4} autoClear={false}>
        <Outline
          selection={ringA}
          selectionLayer={10}
          visibleEdgeColor={colors.graphite}
          hiddenEdgeColor={colors.graphite}
          blendFunction={BlendFunction.ALPHA}
          edgeStrength={3}
          xRay={false}
          multisampling={4}
          resolutionScale={1 / dpr}
        />
        <Outline
          selection={ringB}
          selectionLayer={11}
          visibleEdgeColor={colors.graphite}
          hiddenEdgeColor={colors.graphite}
          blendFunction={BlendFunction.ALPHA}
          edgeStrength={3}
          xRay={false}
          multisampling={4}
          resolutionScale={1 / dpr}
        />
      </EffectComposer>
    </>
  );
}

/** The physics: the teal ring fixed, the marigold ring falling through it and hooking (@datingapp/interchange/hook). */
function Hook({
  map,
  rest,
  body,
  started,
  onAtRest,
}: {
  map: MapLayout;
  rest: { a: Pose; b: Pose };
  body: RefObject<RapierRigidBody | null>;
  started: RefObject<boolean>;
  onAtRest: () => void;
}) {
  const r = tubeRadius(map);
  const story = useRef({ steps: 0, solid: false, caught: null as number | null, done: false });
  const start = startPose(rest.b);

  useBeforePhysicsStep(() => {
    const b = body.current;
    const s = story.current;
    if (!b || s.done) return;
    if (!started.current) {
      // Held above until the canvas is showing.
      b.setLinvel(ZERO, false);
      b.setAngvel(ZERO, false);
      b.setGravityScale(0, false);
      return;
    }
    s.steps += 1;
    const t = s.steps * HOOK.step;
    const pose = { position: b.translation(), rotation: b.rotation() };
    if (!s.solid) {
      // Through the teal ring and clear of it: from now on they collide.
      if (linking(rest.a, pose) !== 0 && ringGap(rest.a, pose) > 2 * r + 0.03) {
        s.solid = true;
        for (let i = 0; i < b.numColliders(); i++) b.collider(i).setCollisionGroups(B_SOLID);
      }
    } else if (s.caught === null && ringGap(rest.a, pose) < 2 * r + 0.01) {
      s.caught = t;
    }
    const now = { position: pose.position, velocity: b.linvel(), rotation: pose.rotation, spin: b.angvel() };
    if ((s.caught !== null && atRest(now, rest.b)) || t > HOOK.deadline) {
      s.done = true;
      b.setTranslation(rest.b.position, false);
      b.setRotation(rest.b.rotation, false);
      b.setLinvel(ZERO, false);
      b.setAngvel(ZERO, false);
      b.setGravityScale(0, false);
      onAtRest();
      return;
    }
    const next = control(now, rest.b, s.caught === null ? null : t - s.caught);
    b.setGravityScale(next.gravityScale, true);
    b.setLinvel(next.velocity, true);
    b.setAngvel(next.spin, true);
  });

  const capsules = CAPSULES.map((c, i) => <CapsuleCollider key={i} args={[c.halfHeight, r]} position={c.center} rotation={[0, 0, c.angle]} />);
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={vec(rest.a)} rotation={euler(rest.a)} collisionGroups={A_GROUPS}>
        {capsules}
      </RigidBody>
      <RigidBody
        ref={body}
        type="dynamic"
        colliders={false}
        position={vec(start)}
        rotation={euler(start)}
        collisionGroups={B_GHOST}
        gravityScale={0}
        friction={0.4}
        restitution={0.2}
        ccd
        canSleep={false}
      >
        {capsules}
      </RigidBody>
    </>
  );
}

/** The two lines and the joined rails, as strips whose faces are the SVG's strokes. */
function Lines({ map, materials }: { map: MapLayout; materials: Materials }) {
  const lines = useMemo(() => [...map.lines, ...map.rails].map((line) => ({ tone: line.tone, geometry: lineGeometry(line, map) })), [map]);
  return (
    <>
      {lines.map((line, i) => (
        <mesh key={i} geometry={line.geometry} material={materials[line.tone]} />
      ))}
    </>
  );
}

/**
 * The stations: white roundels with graphite rims, as shallow studs standing on the
 * line's face (a stud as deep as the line read as a heavy graphite post).
 */
function Stations({ map, materials }: { map: MapLayout; materials: Materials }) {
  const shapes = useMemo(() => stationShapes(map), [map]);
  return (
    <>
      {map.stations.map((s) => (
        <group key={`${s.x},${s.y}`} position={[s.x / UNIT, -s.y / UNIT, 0]}>
          <mesh geometry={shapes.rim} material={materials.graphite} />
          <mesh geometry={shapes.face} material={materials.white} position={[0, 0, shapes.top + 0.001]} />
        </group>
      ))}
    </>
  );
}

/** Three flat tones in the page's exact colours (@datingapp/interchange/meshes). */
function useMaterials(colors: SceneColors): Materials {
  return useMemo(() => toonMaterials(colors), [colors]);
}

const vec = (pose: Pose): [number, number, number] => [pose.position.x, pose.position.y, pose.position.z];
const quat = (pose: Pose): [number, number, number, number] => [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w];
/** Rigid bodies take a rotation as Euler angles. */
const euler = (pose: Pose): [number, number, number] => {
  const e = new Euler().setFromQuaternion(new Quaternion(...quat(pose)));
  return [e.x, e.y, e.z];
};
/** Fast, then settling: the relief arrives at once and eases into place. */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
