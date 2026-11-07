// VID-1..5 (stage 19, D098-D099): the candlelight loop and its posters come from this
// site unless an https media origin is set; it can be switched off; and it's skipped
// whenever the visitor's settings or connection say so. (Node strips the types from
// lib/heroVideo.ts.)
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { chooseHeroVideo, heroVideoConfig, heroVideoOrigins, LOOP_NAME } from "../lib/heroVideo.ts";

const roomy = { reducedMotion: false, saveData: false, effectiveType: "4g", narrow: false };

test("this site's /media by default: WebM first, MP4 second, a WebP poster per size", () => {
  const video = heroVideoConfig({});
  assert.equal(video.play, true);
  assert.deepEqual(video.large, {
    poster: `/media/${LOOP_NAME}-720.webp`,
    sources: [
      { src: `/media/${LOOP_NAME}-720.webm`, type: "video/webm" },
      { src: `/media/${LOOP_NAME}-720.mp4`, type: "video/mp4" },
    ],
  });
  assert.equal(video.small.poster, `/media/${LOOP_NAME}-480.webp`);
});

test("every file the page names exists and stays small (the whole set under 1 MB)", () => {
  const video = heroVideoConfig({});
  const files = [video.large, video.small].flatMap((set) => [set.poster, ...set.sources.map((s) => s.src)]);
  let total = 0;
  for (const file of files) {
    const path = resolve(import.meta.dirname, "../public", `.${file}`);
    assert.ok(existsSync(path), `${file} is missing`);
    total += statSync(path).size;
  }
  assert.ok(total < 1024 * 1024, `the loop's files total ${total} bytes`);
});

test("HERO_VIDEO=off keeps the posters but plays nothing", () => {
  const video = heroVideoConfig({ HERO_VIDEO: " OFF " });
  assert.equal(video.play, false);
  assert.equal(chooseHeroVideo(video, roomy), null);
  assert.equal(video.large.poster, `/media/${LOOP_NAME}-720.webp`);
});

test("another media origin only over https, and the CSP allows exactly that origin", () => {
  const remote = { MEDIA_BASE_URL: "https://media.example.in/assets/" };
  assert.equal(heroVideoConfig(remote).large.sources[0].src, `https://media.example.in/assets/media/${LOOP_NAME}-720.webm`);
  assert.deepEqual(heroVideoOrigins(remote), { media: ["https://media.example.in"], img: ["https://media.example.in"] });
  for (const bad of ["http://media.example.in", "javascript:alert(1)", "not a url", " "]) {
    assert.equal(heroVideoConfig({ MEDIA_BASE_URL: bad }).large.poster, `/media/${LOOP_NAME}-720.webp`, bad);
    assert.deepEqual(heroVideoOrigins({ MEDIA_BASE_URL: bad }), { media: [], img: [] }, bad);
  }
});

test("no video for reduced motion, the data saver or a slow connection; small screens get the light files", () => {
  const video = heroVideoConfig({});
  assert.equal(chooseHeroVideo(video, roomy), video.large);
  assert.equal(chooseHeroVideo(video, { ...roomy, narrow: true }), video.small);
  assert.equal(chooseHeroVideo(video, { ...roomy, reducedMotion: true }), null);
  assert.equal(chooseHeroVideo(video, { ...roomy, saveData: true }), null);
  for (const slow of ["slow-2g", "2g", "3g"]) assert.equal(chooseHeroVideo(video, { ...roomy, effectiveType: slow }), null);
  assert.equal(chooseHeroVideo(video, { ...roomy, effectiveType: undefined }), video.large);
});
