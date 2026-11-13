/**
 * MOB-3D-1, -3 (stage 21b, D122): the welcome map as data is the map stage 20e drew,
 * its bars meet in mitres (as the 3D strips do), and the 3D welcome's recording was made
 * for these rings. MOB-3D-4: who gets the scene (sceneGate.ts).
 */
import { segments } from "@datingapp/interchange/map";
import { WELCOME_TRACK } from "@datingapp/interchange/welcome-track";

import { RING } from "@/ui/Rings";
import { chooseWelcomeScene, readViewing, type Viewing } from "@/ui/sceneGate";
import { bars, MAP, welcomeMap } from "@/ui/welcomeMap";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("MOB-3D-1: the map as data is the one stage 20e drew, at any width", () => {
  for (const w of [320, 342, 412, 560]) {
    const map = welcomeMap(w);
    const D = RING.diameter;
    const edge = (D / 2) * Math.SQRT1_2;
    const [left, right] = map.rings;
    expect(left).toEqual({ x: w / 2 - RING.apart / 2, y: 100 });
    expect(right).toEqual({ x: w / 2 + RING.apart / 2, y: 100 });
    const [you, them] = map.lines.map((l) => segments(l.d));
    // In from the edges, level...
    expect(you![0]!.from).toEqual({ x: 0, y: 28 });
    expect(them![0]!.from).toEqual({ x: w, y: 44 });
    // ...then down at 45 degrees to the rings' 45-degree edges.
    for (const [line, end] of [
      [you!, { x: left!.x - edge, y: left!.y - edge }],
      [them!, { x: right!.x + edge, y: right!.y - edge }],
    ] as const) {
      const turn = line[1]!;
      expect(near(Math.abs(turn.to.x - turn.from.x), turn.to.y - turn.from.y)).toBe(true);
      expect(near(turn.to.x, end.x) && near(turn.to.y, end.y)).toBe(true);
    }
    // Below the rings, the joined rails run to the bottom, 6 points either side of the middle.
    expect(map.rails.map((r) => r.d)).toEqual([
      [["M", w / 2 - 6, 100 + D / 2 - 4], ["V", MAP.height]],
      [["M", w / 2 + 6, 100 + D / 2 - 4], ["V", MAP.height]],
    ]);
    // Two stations a line, the inner one kept clear of the turn.
    expect(map.stations.map((s) => s.x)).toEqual([20, Math.min(52, you![0]!.to.x - 18), w - 20, Math.max(w - 52, them![0]!.to.x + 18)]);
    // A roundel's and a ring's strokes are inside their boxes: the centrelines run half a stroke in.
    expect(map.stationRadius + map.stationStroke / 2).toBe(MAP.stop / 2);
    expect(map.ringRadius + map.ringStroke / 2).toBe(D / 2);
  }
});

test("MOB-3D-1: where a line turns, its two bars meet in a mitre, with no notch", () => {
  const map = welcomeMap(342);
  const T = map.lineWidth;
  for (const line of map.lines) {
    const [a, b] = bars(line.d, T);
    // The outer corners: the end of the level bar and the start of the sloping one, on the outside of the turn.
    const corner = (bar: typeof a, end: 1 | -1, side: 1 | -1) => ({
      x: bar!.cx + (Math.cos(bar!.angle) * bar!.length * end) / 2 - (Math.sin(bar!.angle) * T * side) / 2,
      y: bar!.cy + (Math.sin(bar!.angle) * bar!.length * end) / 2 + (Math.cos(bar!.angle) * T * side) / 2,
    });
    // The turn bends towards +y (down) for both lines; the outside is the side away from it.
    const outsideA = Math.cos(a!.angle) > 0 ? -1 : 1;
    const p = corner(a, 1, outsideA as 1 | -1);
    const q = corner(b, -1, outsideA as 1 | -1);
    expect(near(p.x, q.x, 1e-9) && near(p.y, q.y, 1e-9)).toBe(true);
  }
  // A line with no turn is one bar, exactly as long as the line.
  const rail = bars(map.rails[0]!.d, T);
  expect(rail).toHaveLength(1);
  expect(near(rail[0]!.length, MAP.height - segments(map.rails[0]!.d)[0]!.from.y)).toBe(true);
});

test("MOB-3D-3: the 3D welcome's recording was made for these rings", () => {
  const map = welcomeMap(342);
  const r = map.ringRadius;
  expect(WELCOME_TRACK.rings.tube).toBeCloseTo(map.ringStroke / 2 / r, 3);
  expect(WELCOME_TRACK.rings.apart).toBeCloseTo((map.rings[1].x - map.rings[0].x) / r, 3);
});

const browser = (over: Partial<Viewing> = {}): Viewing => ({ saveData: false, connection: "4g", forcedColors: false, memory: 8, webgl2: true, ...over });

test("MOB-3D-4: a phone gets the scene unless it's switched off; a browser, unless something says otherwise", () => {
  expect(chooseWelcomeScene(null, true)).toBe(true);
  expect(chooseWelcomeScene(null, false)).toBe(false);
  expect(chooseWelcomeScene(browser(), true)).toBe(true);
  expect(chooseWelcomeScene(browser({ connection: "3g" }), true)).toBe(true);
  expect(chooseWelcomeScene(browser({ connection: null, memory: null }), true)).toBe(true);
  for (const over of [{ saveData: true }, { connection: "2g" }, { connection: "slow-2g" }, { forcedColors: true }, { memory: 2 }, { webgl2: false }]) {
    expect(chooseWelcomeScene(browser(over), true)).toBe(false);
  }
  expect(chooseWelcomeScene(browser(), false)).toBe(false);
});

test("MOB-3D-4: readViewing asks the browser, gives the probe's context back, and a canvas that throws means no WebGL 2", () => {
  const loseContext = jest.fn();
  const win = (getContext: () => unknown) => ({
    navigator: { connection: { saveData: true, effectiveType: "3g" }, deviceMemory: 4 },
    matchMedia: (q: string) => ({ matches: q === "(forced-colors: active)" }),
    document: { createElement: () => ({ getContext }) },
  });
  expect(readViewing(win(() => ({ getExtension: () => ({ loseContext }) })))).toEqual({
    saveData: true,
    connection: "3g",
    forcedColors: true,
    memory: 4,
    webgl2: true,
  });
  expect(loseContext).toHaveBeenCalledTimes(1);
  expect(
    readViewing(
      win(() => {
        throw new Error("no GL");
      }),
    )?.webgl2,
  ).toBe(false);
  // On a phone there's nothing to ask (Jest runs as a phone here).
  expect(readViewing()).toBeNull();
});
