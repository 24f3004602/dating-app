/**
 * The welcome screen's route map as data (stage 20e drew it with views, D105; stage 21b
 * reads it in 3D too, D122): your line (teal) and theirs (marigold) run in from the
 * panel's edges, turn down at 45 degrees like a metro diagram, end at the rings, and run
 * on together below them. RouteMap.tsx draws it with views and the 3D welcome builds the
 * same shapes from the same numbers (@datingapp/interchange), so the two match point for
 * point. Units are points; the map is as wide as the panel gives it. Pure, so it's
 * unit-tested (welcomeMap.test.ts).
 */
import { type MapLayout, type Point, segments } from "@datingapp/interchange/map";

import { RING } from "@/ui/Rings";

/** The map's fixed measures, in points. */
export const MAP = {
  height: 176,
  /** A line's thickness. */
  line: 8,
  /** A station roundel across, and its graphite stroke (inside it). */
  stop: 16,
  stopStroke: 3,
  /** Where the lines come in, and the rings' centre line. */
  youY: 28,
  themY: 44,
  ringY: 100,
  /** The joined rails below the rings: each this far from the middle. */
  railOffset: 6,
} as const;

export function welcomeMap(width: number): MapLayout {
  const { height: H, youY, themY, ringY, railOffset } = MAP;
  const D = RING.diameter;
  // From a ring's centre to its 45-degree edge, on each axis: where the lines meet it.
  const edge = (D / 2) * Math.SQRT1_2;
  // The interchange in the middle gives both lines room for two stations each, even at 320 points.
  const cx = width * 0.5;
  const left: Point = { x: cx - RING.apart / 2, y: ringY };
  const right: Point = { x: cx + RING.apart / 2, y: ringY };
  // Your line comes in high and turns down to the left ring; theirs, lower, to the right one.
  const youTurn = left.x - edge - (left.y - edge - youY);
  const themTurn = right.x + edge + (right.y - edge - themY);
  // The joined rails start just inside the rings' lower edge.
  const below = ringY + D / 2 - 4;
  return {
    width,
    height: H,
    extent: { minX: 0, maxX: width, minY: 0, maxY: H },
    lineWidth: MAP.line,
    lines: [
      { tone: "teal", d: [["M", 0, youY], ["H", youTurn], ["L", left.x - edge, left.y - edge]] },
      { tone: "marigold", d: [["M", width, themY], ["H", themTurn], ["L", right.x + edge, right.y - edge]] },
    ],
    rails: [
      { tone: "teal", d: [["M", cx - railOffset, below], ["V", H]] },
      { tone: "marigold", d: [["M", cx + railOffset, below], ["V", H]] },
    ],
    stations: [
      { x: 20, y: youY, tone: "teal" },
      { x: Math.min(52, youTurn - 18), y: youY, tone: "teal" },
      { x: width - 20, y: themY, tone: "marigold" },
      { x: Math.max(width - 52, themTurn + 18), y: themY, tone: "marigold" },
    ],
    // A roundel's stroke is drawn inside its box: the centreline runs half a stroke in.
    stationRadius: (MAP.stop - MAP.stopStroke) / 2,
    stationStroke: MAP.stopStroke,
    rings: [left, right],
    // Likewise the rings: the centreline radius, and the stroke around it.
    ringRadius: D / 2 - RING.stroke / 2,
    ringStroke: RING.stroke,
  };
}

/** A straight piece of a line, as the view that draws it: centre, length, angle. */
export type Bar = { cx: number; cy: number; length: number; angle: number };

/**
 * A line as straight bars. Where two meet at a turn, each runs on past the turn by
 * half the line's thickness times tan(turn / 2), so their outer corners meet in a mitre
 * (as the 3D strip's do) instead of leaving a notch. Straight lines only (the welcome
 * map has no curves).
 */
export function bars(d: MapLayout["lines"][number]["d"], thickness: number): Bar[] {
  const pieces = segments(d).map((s) => {
    if (s.kind !== "line") throw new Error("the welcome map draws straight lines only");
    return { from: s.from, to: s.to };
  });
  const dir = (p: { from: Point; to: Point }) => Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x);
  const extra = (a: number, b: number) => {
    const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    return (thickness / 2) * Math.tan(turn / 2);
  };
  return pieces.map((p, i) => {
    const angle = dir(p);
    const back = i > 0 ? extra(dir(pieces[i - 1]!), angle) : 0;
    const on = i < pieces.length - 1 ? extra(angle, dir(pieces[i + 1]!)) : 0;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const from = { x: p.from.x - ux * back, y: p.from.y - uy * back };
    const to = { x: p.to.x + ux * on, y: p.to.y + uy * on };
    return { cx: (from.x + to.x) / 2, cy: (from.y + to.y) / 2, length: Math.hypot(to.x - from.x, to.y - from.y), angle };
  });
}
