/**
 * The site's looping background video (stage 19, D098-D099): candlelight, with
 * no people in it. The source is Pexels clip 6283476, flames only from 6.6 s,
 * made into a seamless 5.5-second loop by scripts/encode-loop.sh. It plays in
 * the landing page's story card and, from this site's /media, behind the app's
 * welcome screen.
 *
 * Settings (the web server's environment):
 *   HERO_VIDEO=off   no video (the still posters stay)
 *   MEDIA_BASE_URL   an https origin (and optional path) serving the same files,
 *                    e.g. Cloudflare R2; unset: this site's own /media
 *
 * Pure functions with no Next.js imports: the page, the CSP (proxy.ts) and the
 * unit tests (tests/heroVideo.test.mjs) all use them.
 */

export const LOOP_NAME = "candles-v1";

export type VideoSource = { src: string; type: "video/webm" | "video/mp4" };
export type VideoSet = { poster: string; sources: VideoSource[] };
export type HeroVideo = { large: VideoSet; small: VideoSet; play: boolean };

/** "" (this site), or an https origin with an optional path; anything else falls back to this site. */
function mediaBase(value: string | undefined): string {
  const v = value?.trim();
  if (!v) return "";
  try {
    const url = new URL(v);
    return url.protocol === "https:"
      ? `${url.origin}${url.pathname.replace(/\/$/, "")}`
      : "";
  } catch {
    return "";
  }
}

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

export function heroVideoConfig(
  env: Record<string, string | undefined>,
): HeroVideo {
  const base = mediaBase(env.MEDIA_BASE_URL);
  return {
    large: videoSet(base, 720),
    small: videoSet(base, 480),
    play: env.HERO_VIDEO?.trim().toLowerCase() !== "off",
  };
}

/** The origins the CSP must allow for the video and its posters (this site's own need none). */
export function heroVideoOrigins(env: Record<string, string | undefined>): {
  media: string[];
  img: string[];
} {
  const base = mediaBase(env.MEDIA_BASE_URL);
  const origins = base ? [new URL(base).origin] : [];
  return { media: origins, img: origins };
}

export type Viewing = {
  reducedMotion: boolean;
  /** The browser's data saver (navigator.connection.saveData). */
  saveData: boolean;
  /** navigator.connection.effectiveType, where the browser reports it. */
  effectiveType?: string;
  /** A small screen (40rem or narrower). */
  narrow: boolean;
};

export const SLOW: ReadonlySet<string> = new Set(["slow-2g", "2g", "3g"]);

/**
 * Which files to play, or null for none (the still poster stays): no video when
 * it's switched off, motion is reduced, the data saver is on or the connection
 * is slow; small screens get the lighter files.
 */
export function chooseHeroVideo(
  video: HeroVideo,
  viewing: Viewing,
): VideoSet | null {
  if (!video.play || viewing.reducedMotion || viewing.saveData) return null;
  if (viewing.effectiveType && SLOW.has(viewing.effectiveType)) return null;
  return viewing.narrow ? video.small : video.large;
}
