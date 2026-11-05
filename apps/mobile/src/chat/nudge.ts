/**
 * The pre-send nudge (D075), matching the API's rule in
 * `apps/api/app/modules/messaging/nudge.py`: NFKC, lower case, then runs of
 * letters, combining marks and digits (so Devanagari words stay whole); a
 * term matches when its words appear one after another. It only ever asks
 * "send anyway?"; nothing is blocked.
 */

export type NudgeTerms = { version: string; hurtful: string[]; money: string[] };
export type NudgeKind = "hurtful" | "money";

// Unicode property escapes need a modern engine. If one is missing, fall back
// to splitting on spaces and ASCII punctuation rather than crash the chat.
const WORD = (() => {
  try {
    return new RegExp("[\\p{L}\\p{M}\\p{N}]+", "gu");
  } catch {
    return /[^\s!-/:-@[-`{-~]+/g;
  }
})();

export function words(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(WORD) ?? [];
}

function contains(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    if (phrase.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/** The first list with a matching term (hurtful before money), or null. */
export function nudgeFor(text: string, terms: NudgeTerms | undefined): NudgeKind | null {
  if (!terms) return null;
  const found = words(text);
  for (const kind of ["hurtful", "money"] as const) {
    if (terms[kind].some((term) => contains(found, words(term)))) return kind;
  }
  return null;
}
