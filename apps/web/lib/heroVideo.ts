/**
 * The landing page's background video (stage 19, D098): off unless configured.
 *
 * While the site is served through Cloudflare's free plan, it must stay off:
 * Cloudflare's terms (Service-Specific Terms, CDN, read 2026-11-06) don't allow
 * serving video through the CDN from your own server without a paid Cloudflare
 * service. Turn it on when the site is served directly (the Lightsail plan,
 * deploy.md), or with video hosted on Cloudflare Stream or R2.
 *
 * Settings (the web server's environment):
 *   HERO_VIDEO_URL         the wide video (WebM or MP4), https or a path on this site
 *   HERO_VIDEO_MOBILE_URL  optional, a lighter one for small screens (none: no video there)
 *   HERO_VIDEO_POSTER      optional, the still shown while it loads
 *
 * Pure functions with no Next.js imports: the page, the CSP (proxy.ts) and
 * the unit tests (tests/heroVideo.test.mjs) all use them.
 */

export type HeroVideo = {
  src: string;
  mobileSrc: string | null;
  poster: string | null;
};

/** https URLs, or paths on this site; anything else is ignored (never `javascript:` or `http:`). */
function usable(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function heroVideoConfig(
  env: Record<string, string | undefined>,
): HeroVideo | null {
  const src = usable(env.HERO_VIDEO_URL);
  if (!src) return null;
  return {
    src,
    mobileSrc: usable(env.HERO_VIDEO_MOBILE_URL),
    poster: usable(env.HERO_VIDEO_POSTER),
  };
}

/** The origins the CSP must allow for the video and its poster (paths on this site need none). */
export function heroVideoOrigins(video: HeroVideo | null): {
  media: string[];
  img: string[];
} {
  const origin = (u: string | null) =>
    u && !u.startsWith("/") ? new URL(u).origin : null;
  const media = [
    origin(video?.src ?? null),
    origin(video?.mobileSrc ?? null),
  ].filter((o): o is string => o !== null);
  const img = [origin(video?.poster ?? null)].filter(
    (o): o is string => o !== null,
  );
  return { media: [...new Set(media)], img };
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

const SLOW = new Set(["slow-2g", "2g", "3g"]);

/**
 * Which file to play, or null for none: the drawn shoreline stays. No video when
 * motion is reduced, the data saver is on, or the connection is slow; small
 * screens only ever get the lighter file.
 */
export function chooseHeroVideo(
  video: HeroVideo,
  viewing: Viewing,
): string | null {
  if (viewing.reducedMotion || viewing.saveData) return null;
  if (viewing.effectiveType && SLOW.has(viewing.effectiveType)) return null;
  return viewing.narrow ? video.mobileSrc : video.src;
}
