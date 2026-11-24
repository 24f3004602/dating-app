/**
 * The landing page's languages (stage 22a, D120; the owner's request, 2026-11-13): one
 * language per page, never Hindi written beside the English. English is at /, Hindi
 * at /hi, and the sign band links each page to the other. Both dictionaries are this
 * one type, so a missing translation fails the typecheck.
 */
export type Lang = "en" | "hi";

export const LANGS: readonly Lang[] = ["en", "hi"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "hi";
}

/** Where each language's landing page lives. */
export const HOME: Record<Lang, string> = { en: "/", hi: "/hi" };

export type Station = { title: string; body: string; interchange?: boolean };

export type Messages = {
  lang: Lang;
  meta: { title: string; description: string };
  skip: string;
  /** The sign band's way into the app (D133). */
  signIn: string;
  /** The language option in the sign band: the other language, named in itself. */
  other: { lang: Lang; name: string };
  headline: string;
  lede: string;
  map: {
    /** The map's accessible name. */
    title: string;
    /** The phone map's labels. */
    yourLine: string;
    theirs: string;
    /** The wide map's labels. */
    yourLineLong: string;
    theirsLong: string;
    /** The interchange's label. */
    bothWays: string;
  };
  join: { heading: string; endHeading: string };
  /** The panels' ways into the app, and what to expect there (D133). */
  start: { create: string; signIn: string; note: string };
  route: {
    title: string;
    legendLabel: string;
    legend: { you: string; them: string; rings: string; end: string };
    towards: string;
  };
  stations: Station[];
  terminus: { title: string; body: string };
  /** The button that pauses the first screen's candlelight loop. */
  pause: string;
  footer: {
    lead: (brand: string) => string;
    terms: string;
    joiner: string;
    privacy: string;
    close: string;
    /** Stage 28d: the complaints page (the IT Rules want it reachable from the home page, D155)
     * and the Android download (D154), both in English; `note` says so where needed. */
    complaints: string;
    android: string;
    note: string;
  };
};
