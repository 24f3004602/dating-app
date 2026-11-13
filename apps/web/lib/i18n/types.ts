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
  status: string;
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
  form: {
    email: string;
    adult: string;
    consent: (brand: string) => string;
    privacy: string;
    submit: string;
    pending: string;
    done: string;
    errors: { email: string; adult: string; underage: string; outOfDate: string; tooMany: string; unavailable: string };
  };
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
  footer: { lead: (brand: string) => string; terms: string; joiner: string; privacy: string; close: string };
};
