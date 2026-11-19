/** Sign in with Google (D134): what both apps' adapters take and give. */

/** Where a Google sign-in can start, and where the web app returns if it's cancelled. */
export const GOOGLE_FROM = ["/welcome", "/sign-in", "/sign-up", "/delete-account"] as const;
export type GoogleFrom = (typeof GOOGLE_FROM)[number];

export function safeFrom(from: string | null | undefined): GoogleFrom {
  return (GOOGLE_FROM as readonly string[]).includes(from ?? "") ? (from as GoogleFrom) : "/welcome";
}

export type GoogleRequest = {
  /** The Web OAuth client's ID, from the API (public). */
  clientId: string;
  /** Where Google sends the web app back (the API's setting); the phone app doesn't need it. */
  redirectUri: string | null;
  /** Signing in (or up), or confirming that it's you before deleting the account. */
  purpose: "sign-in" | "delete";
  /** Keep an account that is waiting to be deleted (D083). */
  restore?: boolean;
  from: GoogleFrom;
};

/** The phone app gets Google's answer in place; the web app leaves for Google's page. */
export type GoogleOutcome =
  | { kind: "token"; idToken: string }
  | { kind: "redirecting" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/** The web app, back from Google's page. */
export type GoogleReturn =
  | { kind: "code"; code: string; verifier: string; purpose: "sign-in" | "delete"; restore: boolean; from: GoogleFrom }
  | { kind: "cancelled"; from: GoogleFrom }
  | { kind: "failed"; from: GoogleFrom };
