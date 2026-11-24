import { Platform } from "react-native";

/**
 * The web app's session (D152): the API keeps it in an HttpOnly cookie, so this browser stays
 * signed in across reloads and visits while no script on the page can read it. The phone app
 * keeps its bearer token in the keystore instead (storage.ts).
 *
 * The requests that open a session ask for the cookie with `X-Session-Cookie`: `persistent`
 * (until the session expires), or `browser` when "Keep me signed in on this browser" is off
 * (gone when the browser closes). That choice survives the round trip to Google's page in this
 * tab's sessionStorage; it holds no secret.
 */
export const COOKIE_SESSIONS = Platform.OS === "web";

export type CookieMode = "persistent" | "browser";

const OPENS_SESSION = new Set([
  "/v1/auth/login",
  "/v1/auth/restore",
  "/v1/auth/verify-email",
  "/v1/auth/google",
  "/v1/auth/google/complete",
]);
const KEEP_KEY = "session.keep";

let keepInMemory = true;

function tabStorage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

/** "Keep me signed in on this browser": on unless turned off in this tab. */
export function keepSignedIn(): boolean {
  const saved = tabStorage()?.getItem(KEEP_KEY);
  return saved === null || saved === undefined ? keepInMemory : saved !== "off";
}

export function setKeepSignedIn(keep: boolean): void {
  keepInMemory = keep;
  tabStorage()?.setItem(KEEP_KEY, keep ? "on" : "off");
}

/** The `X-Session-Cookie` value for a request, or null: other requests, and the phone app. */
export function cookieModeFor(method: string, url: string, cookies: boolean = COOKIE_SESSIONS): CookieMode | null {
  if (!cookies || method !== "POST") return null;
  return OPENS_SESSION.has(new URL(url).pathname) ? (keepSignedIn() ? "persistent" : "browser") : null;
}
