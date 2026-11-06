// VID-1..4 (stage 19, D098): the landing hero's video stays off unless configured,
// accepts only https or same-site sources, and is skipped whenever the visitor's
// settings or connection say so. (Node strips the types from lib/heroVideo.ts.)
import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseHeroVideo, heroVideoConfig, heroVideoOrigins } from "../lib/heroVideo.ts";

const roomy = { reducedMotion: false, saveData: false, effectiveType: "4g", narrow: false };

test("off unless configured; only https or a path on this site", () => {
  assert.equal(heroVideoConfig({}), null);
  assert.equal(heroVideoConfig({ HERO_VIDEO_URL: "  " }), null);
  assert.equal(heroVideoConfig({ HERO_VIDEO_URL: "http://media.example.in/shore.webm" }), null);
  assert.equal(heroVideoConfig({ HERO_VIDEO_URL: "javascript:alert(1)" }), null);
  assert.equal(heroVideoConfig({ HERO_VIDEO_URL: "//media.example.in/shore.webm" }), null);
  assert.deepEqual(heroVideoConfig({ HERO_VIDEO_URL: "/media/shore.webm" }), {
    src: "/media/shore.webm",
    mobileSrc: null,
    poster: null,
  });
});

test("the CSP allows exactly the configured origins", () => {
  const video = heroVideoConfig({
    HERO_VIDEO_URL: "https://media.example.in/shore-1280.webm",
    HERO_VIDEO_MOBILE_URL: "https://media.example.in/shore-640.webm",
    HERO_VIDEO_POSTER: "https://img.example.in/shore.webp",
  });
  assert.deepEqual(heroVideoOrigins(video), { media: ["https://media.example.in"], img: ["https://img.example.in"] });
  assert.deepEqual(heroVideoOrigins(heroVideoConfig({ HERO_VIDEO_URL: "/media/shore.webm" })), { media: [], img: [] });
  assert.deepEqual(heroVideoOrigins(null), { media: [], img: [] });
});

test("no video for reduced motion, the data saver or a slow connection", () => {
  const video = { src: "/wide.webm", mobileSrc: "/small.webm", poster: null };
  assert.equal(chooseHeroVideo(video, roomy), "/wide.webm");
  assert.equal(chooseHeroVideo(video, { ...roomy, reducedMotion: true }), null);
  assert.equal(chooseHeroVideo(video, { ...roomy, saveData: true }), null);
  for (const slow of ["slow-2g", "2g", "3g"]) assert.equal(chooseHeroVideo(video, { ...roomy, effectiveType: slow }), null);
  assert.equal(chooseHeroVideo(video, { ...roomy, effectiveType: undefined }), "/wide.webm");
});

test("small screens only ever get the light file, or none", () => {
  assert.equal(chooseHeroVideo({ src: "/wide.webm", mobileSrc: "/small.webm", poster: null }, { ...roomy, narrow: true }), "/small.webm");
  assert.equal(chooseHeroVideo({ src: "/wide.webm", mobileSrc: null, poster: null }, { ...roomy, narrow: true }), null);
});
