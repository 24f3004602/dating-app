/**
 * The first screen's route map as data (stage 20d drew it, stage 21a reads it again in 3D,
 * D119): two lines run in, meet at the interchange (the two rings) and run on together.
 * RouteDiagram.tsx draws it as SVG and the 3D scene builds the same shapes from the same
 * numbers, point for point, so the joined rails still run into the station rails below.
 * Units are the SVG's viewBox units. The types and the path functions are shared with
 * the app (packages/interchange); these are the website's two maps. Pure, so it's
 * unit-tested (tests/routeMap.test.mjs).
 */
import type { MapLayout } from "@datingapp/interchange/map";

export { type Cmd, type MapLayout, type MapLine, type Point, type Segment, type Tone, pathD, segments } from "@datingapp/interchange/map";

/** Phones: the line arrives at the waitlist panel. */
export const COMPACT: MapLayout = {
  width: 400,
  height: 196,
  extent: { minX: -24, maxX: 424, minY: 0, maxY: 214 },
  lineWidth: 10,
  lines: [
    { tone: "teal", d: [["M", -24, 44], ["H", 118], ["Q", 154, 44, 168, 82], ["L", 180, 116]] },
    { tone: "marigold", d: [["M", 424, 80], ["H", 286], ["Q", 250, 80, 236, 106], ["L", 224, 124]] },
  ],
  rails: [
    { tone: "teal", d: [["M", 191, 150], ["V", 214]] },
    { tone: "marigold", d: [["M", 205, 150], ["V", 214]] },
  ],
  stations: [
    { x: 44, y: 44, tone: "teal" },
    { x: 92, y: 44, tone: "teal" },
    { x: 358, y: 80, tone: "marigold" },
    { x: 310, y: 80, tone: "marigold" },
  ],
  stationRadius: 8,
  stationStroke: 4,
  rings: [
    { x: 186, y: 134 },
    { x: 210, y: 134 },
  ],
  ringRadius: 22,
  ringStroke: 7,
};

/** Wide screens: the joined rails run past the bottom edge straight into the station rails. */
export const TALL: MapLayout = {
  width: 400,
  height: 470,
  extent: { minX: 0, maxX: 424, minY: 0, maxY: 540 },
  lineWidth: 6.4,
  lines: [
    { tone: "teal", d: [["M", 50, 0], ["V", 318]] },
    { tone: "marigold", d: [["M", 424, 200], ["H", 146], ["Q", 84, 200, 68, 262], ["L", 59, 304]] },
  ],
  rails: [
    { tone: "teal", d: [["M", 50, 352], ["V", 540]] },
    { tone: "marigold", d: [["M", 59, 352], ["V", 540]] },
  ],
  stations: [
    { x: 50, y: 70, tone: "teal" },
    { x: 50, y: 150, tone: "teal" },
    { x: 330, y: 200, tone: "marigold" },
    { x: 250, y: 200, tone: "marigold" },
  ],
  stationRadius: 8,
  stationStroke: 3.5,
  rings: [
    { x: 43, y: 330 },
    { x: 66, y: 330 },
  ],
  ringRadius: 22,
  ringStroke: 6.5,
};
