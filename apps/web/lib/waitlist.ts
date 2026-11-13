/**
 * The waitlist form's rules and words (stage 20d, D101-D102). Pure: no server-only
 * imports, so the Node tests run it directly (tests/waitlist.test.mjs).
 *
 * The API answers joining the same way for every address (new, waiting or already
 * confirmed), so the success words must be true for all three: they never say an
 * email was sent.
 *
 * Joining speaks the page's language (stage 22a, D120: English at /, Hindi at /hi);
 * the confirm and leave pages stay in English, like the emails that link to them.
 */
import { type Lang, messages } from "./i18n/index.ts";

export type FormState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; message: string; field?: "email" | "adult"; email?: string };

export const IDLE: FormState = { status: "idle" };

// Enough to catch typos; the API validates properly.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;

export type JoinInput = { ok: true; email: string } | { ok: false; state: FormState };

export function validateJoin(email: unknown, adult: unknown, lang: Lang = "en"): JoinInput {
  const errors = messages(lang).form.errors;
  const value = typeof email === "string" ? email.trim() : "";
  if (!value || value.length > MAX_EMAIL || !EMAIL.test(value)) {
    return { ok: false, state: { status: "error", field: "email", email: value, message: errors.email } };
  }
  if (adult !== "yes") {
    return { ok: false, state: { status: "error", field: "adult", email: value, message: errors.adult } };
  }
  return { ok: true, email: value };
}

/** What to show after `POST /v1/waitlist` answered with this status and error code. */
export function joinOutcome(status: number, code: string, email: string, lang: Lang = "en"): FormState {
  const form = messages(lang).form;
  if (status === 202) return { status: "done", message: form.done };
  if (status === 422 && code === "underage") return { status: "error", field: "adult", email, message: form.errors.underage };
  if (status === 422 && code === "consent_required") return { status: "error", email, message: form.errors.outOfDate };
  if (status === 422) return { status: "error", field: "email", email, message: form.errors.email };
  if (status === 429) return { status: "error", email, message: form.errors.tooMany };
  return { status: "error", email, message: form.errors.unavailable };
}

export type TokenKind = "confirm" | "leave";

/** What to show after `/confirm` or `/leave` answered. */
export function tokenOutcome(kind: TokenKind, status: number, code: string, brand: string): FormState {
  if (kind === "confirm" && status === 204) {
    return { status: "done", message: `You're on the list. We'll email you once, when ${brand} opens. Nothing else.` };
  }
  if (kind === "leave" && status === 204) {
    return { status: "done", message: "Your address is deleted. We won't email you again." };
  }
  if (kind === "confirm" && status === 400 && code === "invalid_link") {
    return {
      status: "error",
      message:
        "This link has expired or has already been used. If you confirmed already, you're on the list. " +
        "If not, join again for a fresh link.",
    };
  }
  if (status === 429) return { status: "error", message: messages("en").form.errors.tooMany };
  return { status: "error", message: "Something went wrong on our side. Please try the link again in a minute." };
}

/** A token from the link's address, or null when the link is incomplete. */
export function linkToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 128 && /^[A-Za-z0-9_.-]+$/.test(token) ? token : null;
}
