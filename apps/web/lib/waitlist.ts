/**
 * The waitlist's confirm and leave links (stage 20d, D101-D102). Pure: no server-only
 * imports, so the Node tests run it directly (tests/waitlist.test.mjs). Joining ended
 * when sign-up opened (D133): the landing page leads into the app instead, and these
 * pages stay for the links already emailed. They are in English, like the emails.
 */
export type FormState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; message: string; field?: "email" | "adult"; email?: string };

export const IDLE: FormState = { status: "idle" };

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
        "If not, create an account instead: sign-up is open now.",
    };
  }
  if (status === 429) return { status: "error", message: "Too many tries from here. Please wait a while and try again." };
  return { status: "error", message: "Something went wrong on our side. Please try the link again in a minute." };
}

/** A token from the link's address, or null when the link is incomplete. */
export function linkToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 128 && /^[A-Za-z0-9_.-]+$/.test(token) ? token : null;
}
