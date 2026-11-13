// SCN-1..3 (stage 21a, D119): the 3D route map loads only for visitors who haven't asked
// for less, and it can be switched off for everyone. (Node strips the types.)
import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseHeroScene, heroSceneEnabled, readViewing } from "../lib/heroScene.ts";

const roomy = { reducedMotion: false, saveData: false, effectiveType: "4g", forcedColors: false, deviceMemory: 8, webgl2: true };

test("3D only when nothing says otherwise", () => {
  assert.equal(chooseHeroScene(roomy, true), "3d");
  assert.equal(chooseHeroScene({ ...roomy, effectiveType: undefined, deviceMemory: undefined }, true), "3d"); // Safari, Firefox
  assert.equal(chooseHeroScene(roomy, false), "flat"); // HERO_3D=off
  // A 3G estimate still gets the scene (the owner's choice, D119); only 2G is too slow.
  assert.equal(chooseHeroScene({ ...roomy, effectiveType: "3g" }, true), "3d");
  for (const change of [
    { reducedMotion: true },
    { saveData: true },
    { forcedColors: true },
    { effectiveType: "2g" },
    { effectiveType: "slow-2g" },
    { deviceMemory: 2 },
    { webgl2: false },
  ]) {
    assert.equal(chooseHeroScene({ ...roomy, ...change }, true), "flat", JSON.stringify(change));
  }
});

test("HERO_3D=off is the switch, any case; anything else leaves it on", () => {
  assert.equal(heroSceneEnabled({}), true);
  assert.equal(heroSceneEnabled({ HERO_3D: "on" }), true);
  assert.equal(heroSceneEnabled({ HERO_3D: "off" }), false);
  assert.equal(heroSceneEnabled({ HERO_3D: " OFF " }), false);
});

test("readViewing asks the browser, and a canvas that throws means no WebGL", () => {
  const fake = (queries, nav, getContext) => ({
    matchMedia: (q) => ({ matches: queries.includes(q) }),
    navigator: nav,
    document: { createElement: () => ({ getContext }) },
  });
  const lost = [];
  const gl = { getExtension: () => ({ loseContext: () => lost.push(true) }) };
  assert.deepEqual(
    readViewing(fake(["(prefers-reduced-motion: reduce)"], { connection: { saveData: true, effectiveType: "4g" }, deviceMemory: 4 }, () => gl)),
    { reducedMotion: true, saveData: true, effectiveType: "4g", forcedColors: false, deviceMemory: 4, webgl2: true },
  );
  assert.deepEqual(lost, [true]); // the probe gives its context back
  assert.deepEqual(
    readViewing(fake(["(forced-colors: active)"], {}, () => { throw new Error("no GPU"); })),
    { reducedMotion: false, saveData: false, effectiveType: undefined, forcedColors: true, deviceMemory: undefined, webgl2: false },
  );
});
