/**
 * The first screen's route map as data (stage 20d drew it, stage 21a reads it again in 3D,
 * D119): two lines run in, meet at the interchange (the two rings) and run on together.
 * RouteDiagram.tsx draws it as SVG and the 3D scene builds the same shapes from the same
 * numbers, point for point, so the joined rails still run into the station rails below.
 * Units are the SVG's viewBox units. Pure, so it's unit-tested (tests/routeMap.test.mjs).
 */

export type Tone = "teal" | "marigold";

/** SVG path commands, kept as written so `pathD` gives back the drawn path exactly. */
export type Cmd = ["M", number, number] | ["H", number] | ["V", number] | ["L", number, number] | ["Q", number, number, number, number];

export type MapLine = { tone: Tone; d: Cmd[] };
export type Point = { x: number; y: number };

export type MapLayout = {
  /** The SVG's viewBox: width and height. */
  width: number;
  height: number;
  /** Everything drawn, edges included: the lines start past the sides and the rails run past the bottom. */
  extent: { minX: number; maxX: number; minY: number; maxY: number };
  lineWidth: number;
  /** The two lines in, then the joined rails out of the interchange. */
  lines: MapLine[];
  rails: MapLine[];
  stations: (Point & { tone: Tone })[];
  stationRadius: number;
  stationStroke: number;
  /** The interchange: your ring (teal, filled white in the SVG) and theirs (marigold). */
  rings: [Point, Point];
  ringRadius: number;
  ringStroke: number;
};

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

/** The SVG `d` attribute for a list of commands. */
export function pathD(d: Cmd[]): string {
  return d.map((cmd) => cmd.join(" ")).join(" ");
}

/** The points a path passes through, with its quadratic corners kept as control points (for the 3D tubes). */
export type Segment = { kind: "line"; from: Point; to: Point } | { kind: "quad"; from: Point; control: Point; to: Point };

export function segments(d: Cmd[]): Segment[] {
  const out: Segment[] = [];
  let at: Point = { x: 0, y: 0 };
  for (const cmd of d) {
    if (cmd[0] === "M") {
      at = { x: cmd[1], y: cmd[2] };
    } else if (cmd[0] === "H") {
      const to = { x: cmd[1], y: at.y };
      out.push({ kind: "line", from: at, to });
      at = to;
    } else if (cmd[0] === "V") {
      const to = { x: at.x, y: cmd[1] };
      out.push({ kind: "line", from: at, to });
      at = to;
    } else if (cmd[0] === "L") {
      const to = { x: cmd[1], y: cmd[2] };
      out.push({ kind: "line", from: at, to });
      at = to;
    } else {
      const to = { x: cmd[3], y: cmd[4] };
      out.push({ kind: "quad", from: at, control: { x: cmd[1], y: cmd[2] }, to });
      at = to;
    }
  }
  return out;
}
