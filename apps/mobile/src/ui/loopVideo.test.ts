/** VID-6..7 (stage 19, D099): the welcome loop's files and when it plays. */
import { chooseLoop, LOOP_NAME, loopVideo } from "@/ui/loopVideo";

const roomy = { reducedMotion: false, saveData: false, effectiveType: "4g", narrow: false };

test("the files come from the website's /media, WebM first, with a still per size", () => {
  const video = loopVideo("https://example.in/");
  expect(video.large).toEqual({
    poster: `https://example.in/media/${LOOP_NAME}-720.webp`,
    sources: [
      { src: `https://example.in/media/${LOOP_NAME}-720.webm`, type: "video/webm" },
      { src: `https://example.in/media/${LOOP_NAME}-720.mp4`, type: "video/mp4" },
    ],
  });
  expect(video.small.poster).toBe(`https://example.in/media/${LOOP_NAME}-480.webp`);
  // The website's tests check that this name equals theirs (the app's type-check has no Node APIs).
});

test("no video when it's off, motion is reduced, the data saver is on or the connection is slow", () => {
  const video = loopVideo("");
  expect(chooseLoop(video, roomy)).toBe(video.large);
  expect(chooseLoop(video, { ...roomy, narrow: true })).toBe(video.small);
  expect(chooseLoop(video, roomy, false)).toBeNull();
  expect(chooseLoop(video, { ...roomy, reducedMotion: true })).toBeNull();
  expect(chooseLoop(video, { ...roomy, saveData: true })).toBeNull();
  for (const slow of ["slow-2g", "2g", "3g"]) expect(chooseLoop(video, { ...roomy, effectiveType: slow })).toBeNull();
});
