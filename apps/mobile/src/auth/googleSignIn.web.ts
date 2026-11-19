/**
 * Sign in with Google in the web app (D134): Google's page, then back to /auth/google
 * with a one-time code. PKCE (S256) binds the code to this tab and `state` binds the
 * answer to the request; both wait in this tab's sessionStorage, for one return within
 * 15 minutes. The API exchanges the code with the client secret, which never reaches
 * the browser. Only openid, email and profile are asked for.
 */
import { type GoogleFrom, type GoogleOutcome, type GoogleRequest, type GoogleReturn, safeFrom } from "@/auth/googleTypes";

export const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const STORE_KEY = "google-sign-in";
const MAX_AGE_MS = 15 * 60_000;

type Saved = { state: string; verifier: string; purpose: "sign-in" | "delete"; restore: boolean; from: GoogleFrom; at: number };

function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomText(bytes: number): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return base64Url(out);
}

/** crypto.subtle needs a secure page (https, or localhost while developing). */
export function googleSupported(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined" && !!globalThis.crypto?.subtle;
}

export async function startGoogleSignIn(request: GoogleRequest): Promise<GoogleOutcome> {
  if (!request.redirectUri || !googleSupported()) return { kind: "unavailable" };
  try {
    return await leaveForGoogle(request, request.redirectUri);
  } catch {
    return { kind: "failed" }; // storage refused (some private windows), or no hashing: never a stuck button
  }
}

async function leaveForGoogle(request: GoogleRequest, redirectUri: string): Promise<GoogleOutcome> {
  const state = randomText(16);
  const verifier = randomText(32); // 43 characters, within PKCE's 43 to 128
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const saved: Saved = {
    state, verifier, purpose: request.purpose, restore: !!request.restore, from: request.from, at: Date.now(),
  };
  sessionStorage.setItem(STORE_KEY, JSON.stringify(saved));
  const query = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: base64Url(new Uint8Array(digest)),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  window.location.assign(`${AUTHORIZE_URL}?${query.toString()}`);
  return { kind: "redirecting" };
}

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as Partial<Saved> | null;
    if (!saved || typeof saved.state !== "string" || typeof saved.verifier !== "string" || typeof saved.at !== "number") {
      return null;
    }
    return {
      state: saved.state, verifier: saved.verifier, at: saved.at, restore: saved.restore === true,
      purpose: saved.purpose === "delete" ? "delete" : "sign-in", from: safeFrom(saved.from),
    };
  } catch {
    return null;
  }
}

/** Google's answer, once: it must answer this tab's own request, within 15 minutes. */
export function takeGoogleReturn(
  query: { code?: string; state?: string; error?: string },
  now: number = Date.now(),
): GoogleReturn {
  const saved = readSaved();
  sessionStorage.removeItem(STORE_KEY);
  if (!saved) return { kind: "failed", from: "/welcome" };
  const { from } = saved;
  if (!query.state || query.state !== saved.state || now - saved.at > MAX_AGE_MS) return { kind: "failed", from };
  if (query.error) return query.error === "access_denied" ? { kind: "cancelled", from } : { kind: "failed", from };
  if (!query.code) return { kind: "failed", from };
  return { kind: "code", code: query.code, verifier: saved.verifier, purpose: saved.purpose, restore: saved.restore, from };
}
