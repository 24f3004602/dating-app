/**
 * The welcome screen's background loop (stage 19, D099): the website's
 * candlelight video (apps/web/public/media, encoded by
 * apps/web/scripts/encode-loop.sh), loaded from the website, so there's one copy
 * of the files. Pure, so it's unit-tested; WelcomeBackdrop plays it.
 */

/** Keep equal to apps/web/lib/heroVideo.ts (loopVideo.test.ts checks). */
export const LOOP_NAME = "candles-v1";

export type VideoSource = { src: string; type: "video/webm" | "video/mp4" };
export type VideoSet = { poster: string; sources: VideoSource[] };
export type LoopVideo = { large: VideoSet; small: VideoSet };

function videoSet(base: string, width: 480 | 720): VideoSet {
  const file = (ext: string) => `${base}/media/${LOOP_NAME}-${width}.${ext}`;
  // WebM (VP9) first, as it's smaller; MP4 (H.264) for browsers without VP9.
  return {
    poster: file("webp"),
    sources: [
      { src: file("webm"), type: "video/webm" },
      { src: file("mp4"), type: "video/mp4" },
    ],
  };
}

export function loopVideo(base: string): LoopVideo {
  const root = base.replace(/\/$/, "");
  return { large: videoSet(root, 720), small: videoSet(root, 480) };
}

export type Viewing = {
  reducedMotion: boolean;
  saveData: boolean;
  effectiveType?: string;
  /** A small screen (40rem or narrower). */
  narrow: boolean;
};

const SLOW = new Set(["slow-2g", "2g", "3g"]);

/**
 * Which files to play, or null for none (the still stays): none when it's
 * switched off, motion is reduced, the data saver is on or the connection is
 * slow; small screens get the lighter files.
 */
export function chooseLoop(video: LoopVideo, viewing: Viewing, enabled = true): VideoSet | null {
  if (!enabled || viewing.reducedMotion || viewing.saveData) return null;
  if (viewing.effectiveType && SLOW.has(viewing.effectiveType)) return null;
  return viewing.narrow ? video.small : video.large;
}
