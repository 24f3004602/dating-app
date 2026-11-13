import { en } from "./en.ts";
import { hi } from "./hi.ts";
import type { Lang, Messages } from "./types.ts";

export { HOME, isLang, LANGS } from "./types.ts";
export type { Lang, Messages, Station } from "./types.ts";

const ALL: Record<Lang, Messages> = { en, hi };

/** The landing page's words in one language (stage 22a, D120). */
export function messages(lang: Lang): Messages {
  return ALL[lang];
}

/** The page's language from the request's path: only the landing page has a Hindi version. */
export function langForPath(pathname: string): Lang {
  return pathname === "/hi" || pathname === "/hi/" ? "hi" : "en";
}
