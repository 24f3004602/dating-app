/**
 * The welcome's route map in 3D (stage 21b, D122; the owner's direction "Rings that
 * hook", as on the website, D119). Loaded only once the screen has settled, and only
 * when nothing asks for less (sceneGate.ts); the flat map drawn with views stays the
 * picture until this draws two frames that match it, and comes back if anything fails.
 *
 * What happens: the map's lines rise into depth while the marigold ring (theirs) drops
 * through the teal one (yours), catches like a chain link, swings and settles, in about
 * three seconds. Then nothing moves. The ring follows a recording of the website's own
 * physics run (WELCOME_TRACK): phones can't run the engine, and nobody touches it, so the
 * recording is the same motion. Crisp and flat, like the signs: three flat tones, graphite
 * outlines drawn as shells around the rings, edges smoothed by drawing at twice the size.
 */
import { LOOK, UNIT } from "@datingapp/interchange/geometry";
import { type Pose, restPoses, tubeRadius } from "@datingapp/interchange/hook";
import { type MapLayout, scaleMap } from "@datingapp/interchange/map";
import { LIGHT, lineGeometry, type Materials, type SceneColors, stationShapes, toonMaterials } from "@datingapp/interchange/meshes";
import { ObliqueCamera } from "@datingapp/interchange/oblique-camera";
import { poseAt, trackLength } from "@datingapp/interchange/track";
import { WELCOME_TRACK } from "@datingapp/interchange/welcome-track";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { BackSide, type Group, type Mesh, MeshBasicMaterial, TorusGeometry } from "three";

import { color } from "@/theme/tokens";

import { makeRenderer, Supersampler } from "./supersample";

export type SceneProps = {
  /** The welcome map, in points (welcomeMap.ts). */
  map: MapLayout;
  /** Start at rest: it has played already (the width changed). */
  still: boolean;
  /** Two frames are drawn and they match the flat map: the scene can be shown. */
  onReady: () => void;
  /** The rings are at rest; nothing moves any more. */
  onSettled: () => void;
  /** The GL context was lost (the web build): back to the flat map. */
  onLost: () => void;
};

/** The app's colours: the map's white panel, the two lines, sign graphite. */
const COLORS: SceneColors = { ground: color.bg, teal: color.accent, marigold: color.highlight, graphite: color.sign, white: color.bg };
/** Seconds: the map lifts into depth over LIFT, and the rings fade in over the flat ones over FADE. */
const LIFT = 0.9;
const FADE = 0.25;
/** The rings' graphite outline, in points on each side (the website's is about a pixel). */
const OUTLINE = 1.25;

export function InterchangeScene(props: SceneProps) {
  // The shapes are built in the website's units, where a ring's radius is UNIT.
  const map = useMemo(() => scaleMap(props.map, UNIT / props.map.ringRadius), [props.map]);
  const outline = OUTLINE / props.map.ringRadius;
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
      gl={(defaults) => makeRenderer({ ...defaults, antialias: false, alpha: false, stencil: false, powerPreference: "low-power" })}
      onCreated={({ gl }) => lost.watch(gl.domElement)}
    >
      <Interchange
        {...props}
        map={map}
        outline={outline}
        camera={camera}
        settled={settled}
        onSettled={() => {
          setSettled(true);
          props.onSettled();
        }}
      />
    </Canvas>
  );
}

/**
 * A lost context brings the flat map back (the web build). The renderer's own disposal
 * on unmount loses its context on purpose too, so only the live scene listens (as on
 * the website). On phones the canvas never sends the event.
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
      element.addEventListener?.("webglcontextlost", handle);
    },
  };
}

function Interchange({
  map,
  outline,
  still,
  onReady,
  onSettled,
  camera,
  settled,
}: SceneProps & { outline: number; camera: ObliqueCamera; settled: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const materials = useMemo(() => toonMaterials(COLORS), []);
  const hullMaterial = useMemo(() => new MeshBasicMaterial({ color: COLORS.graphite, side: BackSide }), []);
  const rest = useMemo(() => restPoses(map), [map]);
  const r = tubeRadius(map);
  const torus = useMemo(() => new TorusGeometry(1, r, 20, 128), [r]);
  const hull = useMemo(() => new TorusGeometry(1, r + outline, 20, 128), [r, outline]);
  const rings = useRef<Group>(null);
  const ringB = useRef<Group>(null);
  const clock = useRef({ frames: 0, start: -1, done: settled });
  const supersample = useMemo(() => new Supersampler(2), []);

  useEffect(() => () => supersample.dispose(), [supersample]);
  useEffect(() => {
    supersample.setSize(size.width * dpr, size.height * dpr);
    invalidate();
  }, [supersample, size.width, size.height, dpr, invalidate]);
  // Back from the background, a phone may have dropped the last frame: draw it again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && invalidate());
    return () => sub.remove();
  }, [invalidate]);

  // Priority 1: this callback draws the frame itself (through the supersample).
  useFrame((state) => {
    const c = clock.current;
    c.frames += 1;
    // At rest (on demand) nothing else asks for frames: ask until the two that show the canvas.
    if (c.frames < 3) invalidate();
    if (c.frames === 2) onReady();
    // Our own clock: React Three Fiber restarts its clock at zero whenever the frame loop
    // changes (as it does once the rings settle), which would turn the story back in time.
    const now = performance.now() / 1000;
    if (c.frames > 2 && c.start < 0) c.start = now;
    const t = c.start < 0 ? 0 : now - c.start;
    const lift = still ? 1 : easeOutExpo(Math.min(1, t / LIFT));
    const fade = still ? 1 : Math.min(1, t / FADE);
    const sx = LOOK.shear.x * lift;
    const sy = LOOK.shear.y * lift;
    camera.setShear(sx, sy);
    // The rings stay on the flat map's rings whatever the view.
    rings.current?.position.set((LOOK.shear.x - sx) * LOOK.ringZ, (LOOK.shear.y - sy) * LOOK.ringZ, 0);
    for (const m of [materials.ringTeal, materials.ringMarigold, hullMaterial]) {
      m.opacity = fade;
      m.transparent = fade < 1;
    }
    const pose = still || c.done ? rest.b : poseAt(WELCOME_TRACK, rest.b.position, t);
    ringB.current?.position.set(pose.position.x, pose.position.y, pose.position.z);
    ringB.current?.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    supersample.render(state.gl, state.scene, camera);
    if (!c.done && c.start >= 0 && (still || t >= trackLength(WELCOME_TRACK))) {
      c.done = true;
      onSettled();
    }
  }, 1);

  return (
    <>
      <color attach="background" args={[COLORS.ground]} />
      <ambientLight intensity={LIGHT.ambient} />
      <directionalLight intensity={LIGHT.directional} position={LIGHT.direction} />
      <Lines map={map} materials={materials} />
      <Stations map={map} materials={materials} />
      <group ref={rings}>
        <group position={vec(rest.a)} quaternion={quat(rest.a)}>
          <mesh geometry={hull} material={hullMaterial} />
          <mesh geometry={torus} material={materials.ringTeal} />
        </group>
        <group ref={ringB} position={vec(rest.b)} quaternion={quat(rest.b)}>
          <mesh geometry={hull} material={hullMaterial} />
          <mesh geometry={torus} material={materials.ringMarigold} />
        </group>
      </group>
    </>
  );
}

/** The two lines and the joined rails, as strips whose faces are the flat map's bars. */
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

/** The stations: white roundels with graphite rims, as shallow studs on the lines. */
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

const vec = (pose: Pose): [number, number, number] => [pose.position.x, pose.position.y, pose.position.z];
const quat = (pose: Pose): [number, number, number, number] => [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w];
/** Fast, then settling: the relief arrives at once and eases into place. */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
