/**
 * A route map as data (stage 20d drew the website's, stage 21a read it again in 3D,
 * stage 21b draws the app's welcome map from it too; D119, D122): lines run in, meet
 * at the interchange (the two rings) and run on together. The flat drawing (the
 * website's SVG, the app's views) and the 3D scene build the same shapes from the same
 * numbers, point for point. Units are the drawing's own: the website's SVG viewBox
 * units, or the app's points scaled to them (`scaleMap`). Pure, so it's unit-tested.
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

/**
 * The same map with every length multiplied by `k`: the 3D scene works in the website's
 * units (a ring's radius is 22 of them, geometry.ts's UNIT), so a map drawn in other units
 * (the app's points) is scaled to them first.
 */
export function scaleMap(map: MapLayout, k: number): MapLayout {
  const p = <T extends Point>(q: T): T => ({ ...q, x: q.x * k, y: q.y * k });
  const cmd = (c: Cmd): Cmd => {
    switch (c[0]) {
      case "M":
      case "L":
        return [c[0], c[1] * k, c[2] * k];
      case "H":
      case "V":
        return [c[0], c[1] * k];
      case "Q":
        return ["Q", c[1] * k, c[2] * k, c[3] * k, c[4] * k];
    }
  };
  const line = (l: MapLine): MapLine => ({ tone: l.tone, d: l.d.map(cmd) });
  return {
    width: map.width * k,
    height: map.height * k,
    extent: { minX: map.extent.minX * k, maxX: map.extent.maxX * k, minY: map.extent.minY * k, maxY: map.extent.maxY * k },
    lineWidth: map.lineWidth * k,
    lines: map.lines.map(line),
    rails: map.rails.map(line),
    stations: map.stations.map(p),
    stationRadius: map.stationRadius * k,
    stationStroke: map.stationStroke * k,
    rings: [p(map.rings[0]), p(map.rings[1])],
    ringRadius: map.ringRadius * k,
    ringStroke: map.ringStroke * k,
  };
}
