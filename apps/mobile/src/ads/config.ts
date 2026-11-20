/**
 * In-app ads (D137): Google AdMob in the Android app, for members without Plus, at the owner's
 * request ("make it available for google ads and also turn off ads when subscription is on";
 * then "Banners + full-screen ads"). The build decides whether ads exist at all: EXPO_PUBLIC_ADS
 * is "off" (the default), "test" (Google's own test ads) or "live" (the owner's AdMob units in
 * EXPO_PUBLIC_ADMOB_BANNER_ID and EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID). The web app never has ads.
 */
import { Platform } from "react-native";

export type AdsMode = "off" | "test" | "live";

const mode = process.env.EXPO_PUBLIC_ADS;
export const ADS_MODE: AdsMode = mode === "test" || mode === "live" ? mode : "off";

/** Google's own test units for Android (Google Mobile Ads' TestIds). */
export const TEST_UNITS = {
  banner: "ca-app-pub-3940256099942544/9214589741",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
} as const;

export const AD_UNITS =
  ADS_MODE === "live"
    ? { banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID ?? "", interstitial: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID ?? "" }
    : TEST_UNITS;

/** Ads exist only in the Android app: the web app would put ad scripts beside members' chats. */
export const ADS_IN_BUILD = Platform.OS === "android" && ADS_MODE !== "off";

/** Non-personalised only: nothing about a member's activity, here or elsewhere, chooses their ads. */
export const AD_REQUEST = { requestNonPersonalizedAdsOnly: true } as const;

/**
 * The banner's places: the lists (Today, Likes, Matches). Never a chat, a Live call, a profile,
 * Safety, a report, payments, sign-up or the tour.
 */
export const BANNER_PATHS: ReadonlySet<string> = new Set(["/discover", "/likes", "/matches"]);

/**
 * Full-screen ads come only at a natural break: back on Today after deciding about someone. At
 * most one every `everyDecisions` decisions and `minGapMs`, `maxPerDay` in any 24 hours, never
 * in someone's first day, and never straight after a match.
 */
export const FULL_SCREEN = { everyDecisions: 4, minGapMs: 4 * 60_000, maxPerDay: 5, notInFirstMs: 24 * 60 * 60_000 } as const;

export type BreakState = {
  /** Decisions (like or pass) since the last full-screen ad. */
  decisions: number;
  /** The last decision made a match. */
  lastWasMatch: boolean;
  /** When full-screen ads were shown, newest last (epoch ms). */
  shown: readonly number[];
  /** When the account was made (epoch ms); NaN if unknown. */
  joined: number;
  now: number;
};

/** Whether this break may show a full-screen ad. */
export function fullScreenDue(s: BreakState): boolean {
  if (!Number.isFinite(s.joined) || s.now - s.joined < FULL_SCREEN.notInFirstMs) return false;
  if (s.lastWasMatch || s.decisions < FULL_SCREEN.everyDecisions) return false;
  const last = s.shown.at(-1);
  if (last !== undefined && s.now - last < FULL_SCREEN.minGapMs) return false;
  return s.shown.filter((t) => s.now - t < 24 * 60 * 60_000).length < FULL_SCREEN.maxPerDay;
}
