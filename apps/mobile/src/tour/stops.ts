/**
 * The tour's stops (D136), in the order of the line: each names the place it shows and
 * what to say there. The words are the app's own (i18n, `t.tour`); the numbers come from
 * the server (Live's free calls), so the tour never states a number the app doesn't use.
 */
import type { Href } from "expo-router";

import type { LiveOut } from "@/api/live";
import { BRAND } from "@/config";
import { fill, t } from "@/i18n/en";

/** The bottom bar's places, in its order. */
export type Place = "discover" | "likes" | "live" | "matches" | "profile";
export const PLACES: readonly Place[] = ["discover", "likes", "live", "matches", "profile"];
export const PLACE_PATH: Record<Place, Href & string> = {
  discover: "/discover",
  likes: "/likes",
  live: "/live",
  matches: "/matches",
  profile: "/profile",
};

export type StopKey = keyof typeof t.tour.stops;
export type TourStop = { key: StopKey; place: Place; title: string; body: string };

/** Someone counts as new for this long after joining: only they are offered the tour unasked. */
export const NEW_FOR_DAYS = 30;

export function isNewAccount(createdAt: string, now: number = Date.now()): boolean {
  const joined = Date.parse(createdAt);
  return Number.isFinite(joined) && now - joined <= NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}

function callLength(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? t.tour.aMinute : fill(t.tour.minutes, { n: minutes });
}

/**
 * The stops for this member: Live's allowance only while Live is on and has free calls,
 * and the last stop starts with the profile while there isn't one.
 */
export function tourStops({ live, hasProfile }: { live?: LiveOut | null; hasProfile?: boolean }): TourStop[] {
  const s = t.tour.stops;
  const free =
    live?.available && live.free_calls > 0
      ? fill(t.tour.liveFree, { n: live.free_calls, length: callLength(live.free_call_seconds), plan: fill(t.plan.name, { brand: BRAND }) })
      : null;
  return [
    { key: "today", place: "discover", ...s.today },
    { key: "likes", place: "likes", ...s.likes },
    { key: "live", place: "live", title: s.live.title, body: free ? `${s.live.body} ${free}` : s.live.body },
    { key: "matches", place: "matches", ...s.matches },
    { key: "you", place: "profile", ...s.you },
    { key: "safety", place: "profile", ...s.safety },
    { key: "finish", place: "profile", title: s.finish.title, body: hasProfile === false ? `${t.tour.startProfile} ${s.finish.body}` : s.finish.body },
  ];
}

/** What the voice says: the stop's title, then its words, exactly as written on the card. */
export const spoken = (stop: { title: string; body: string }) => `${stop.title}. ${stop.body}`;

/** The offer, as written on its card. */
export const offerText = () => ({ title: fill(t.tour.offerTitle, { brand: BRAND }), body: t.tour.offerBody });
