/**
 * The 3D route map's meshes and materials (stage 21a, D119), shared by the website's hero
 * and the app's welcome (stage 21b, D122) so both have the same shapes and the same three
 * flat tones: the lines as solid strips whose faces are the flat map's strokes, the
 * stations as shallow studs, and toon materials in the drawing's exact colours.
 */
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Float32BufferAttribute,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
} from "three";

import { depthProfile, LOOK, samplePath, stripMesh, UNIT } from "./geometry.ts";
import type { MapLayout, MapLine, Tone } from "./map.ts";

/** The drawing's own colours, so the scene matches the flat map exactly. */
export type SceneColors = { ground: string; teal: string; marigold: string; graphite: string; white: string };

/** A line as a solid strip: its face at z = 0 is the flat map's stroke; its sides run back into depth. */
export function lineGeometry(line: MapLine, map: MapLayout): BufferGeometry {
  const points = samplePath(line.d, 3);
  const mesh = stripMesh(points, map.lineWidth, LOOK.depth, depthProfile(points, map, LOOK.taper));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(mesh.normals, 3));
  geometry.setIndex(mesh.indices);
  return geometry;
}

/**
 * A station: a white roundel with a graphite rim, as a shallow stud standing on the
 * line's face (a stud as deep as the line read as a heavy graphite post). `rim` stands
 * `top` deep; `face` sits on it.
 */
export function stationShapes(map: MapLayout): { top: number; rim: CylinderGeometry; face: CircleGeometry } {
  const outer = (map.stationRadius + map.stationStroke / 2) / UNIT;
  const inner = (map.stationRadius - map.stationStroke / 2) / UNIT;
  const top = LOOK.stud;
  return {
    top,
    rim: new CylinderGeometry(outer, outer, top, 48).rotateX(Math.PI / 2).translate(0, 0, top / 2),
    face: new CircleGeometry(inner, 48),
  };
}

export type Materials = Record<Tone | "graphite" | "white" | "ringTeal" | "ringMarigold", MeshToonMaterial>;

/**
 * Three flat tones: lit faces in the drawing's exact colour, sides and the far side of
 * the rings darker. The rings get their own materials, so they can fade in alone.
 */
export function toonMaterials(colors: SceneColors): Materials {
  const gradient = new DataTexture(new Uint8Array([51, 115, 255]), 3, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const toon = (hex: string) => new MeshToonMaterial({ color: new Color(hex.trim()), gradientMap: gradient });
  return {
    teal: toon(colors.teal),
    marigold: toon(colors.marigold),
    graphite: toon(colors.graphite),
    white: toon(colors.white),
    ringTeal: toon(colors.teal),
    ringMarigold: toon(colors.marigold),
  };
}

/** The light the tones are tuned for: ambient and one directional light from the upper left, in front. */
export const LIGHT = {
  ambient: Math.PI * 0.4,
  directional: Math.PI * 0.6,
  direction: [-0.25, 0.35, 1] as [number, number, number],
} as const;
