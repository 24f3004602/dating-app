/** The web app's Google sign-in (D134): the request Google gets, and the one return it allows. */
// Node's own crypto (the test runs in Node; the app uses the browser's).
const { createHash, webcrypto } = require("crypto") as {
  createHash: (algorithm: string) => { update: (text: string) => { digest: (encoding: string) => string } };
  webcrypto: Crypto;
};

import { AUTHORIZE_URL, STORE_KEY, startGoogleSignIn, takeGoogleReturn } from "@/auth/googleSignIn.web";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const assign = jest.fn();
beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { location: { assign } }, configurable: true });
});
beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
});

const REQUEST = {
  clientId: "123456789012-testclient.apps.googleusercontent.com",
  redirectUri: "https://app.example.in/auth/google",
  purpose: "sign-in" as const,
  from: "/sign-in" as const,
};

async function startAndRead() {
  expect(await startGoogleSignIn(REQUEST)).toEqual({ kind: "redirecting" });
  const url = new URL(assign.mock.calls[0]?.[0] as string);
  const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}") as { state: string; verifier: string };
  return { url, saved };
}

test("Google is asked for a code, bound to this tab by PKCE (S256) and state", async () => {
  const { url, saved } = await startAndRead();
  expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE_URL);
  const q = url.searchParams;
  expect(q.get("client_id")).toBe(REQUEST.clientId);
  expect(q.get("redirect_uri")).toBe(REQUEST.redirectUri);
  expect(q.get("response_type")).toBe("code");
  expect(q.get("scope")).toBe("openid email profile");
  expect(q.get("prompt")).toBe("select_account");
  expect(q.get("code_challenge_method")).toBe("S256");
  expect(q.get("state")).toBe(saved.state);
  expect(saved.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const challenge = createHash("sha256").update(saved.verifier).digest("base64url");
  expect(q.get("code_challenge")).toBe(challenge);
  // The verifier never leaves the tab: it isn't in Google's URL.
  expect(url.toString()).not.toContain(saved.verifier);
});

test("Google's answer is taken once, only for this tab's own request, within 15 minutes", async () => {
  const { saved } = await startAndRead();
  expect(takeGoogleReturn({ code: "c-1", state: saved.state })).toEqual({
    kind: "code", code: "c-1", verifier: saved.verifier, purpose: "sign-in", restore: false, from: "/sign-in",
  });
  expect(takeGoogleReturn({ code: "c-1", state: saved.state })).toEqual({ kind: "failed", from: "/welcome" }); // used

  const second = await startAndRead();
  expect(takeGoogleReturn({ code: "c-2", state: "someone-elses-state" })).toEqual({ kind: "failed", from: "/sign-in" });
  expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
  expect(second.saved.state).not.toBe(saved.state);

  assign.mockReset();
  const third = await startAndRead();
  expect(takeGoogleReturn({ error: "access_denied", state: third.saved.state })).toEqual({ kind: "cancelled", from: "/sign-in" });

  assign.mockReset();
  const late = await startAndRead();
  const sixteenMinutes = Date.now() + 16 * 60_000;
  expect(takeGoogleReturn({ code: "c-3", state: late.saved.state }, sixteenMinutes)).toEqual({ kind: "failed", from: "/sign-in" });
});

test("storage refused (a private window): the button says it failed rather than spinning", async () => {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error("QuotaExceededError"); } },
    configurable: true,
  });
  expect(await startGoogleSignIn(REQUEST)).toEqual({ kind: "failed" });
  expect(assign).not.toHaveBeenCalled();
});

test("no redirect address, no Google: the web app needs the API's setting", async () => {
  expect(await startGoogleSignIn({ ...REQUEST, redirectUri: null })).toEqual({ kind: "unavailable" });
  expect(assign).not.toHaveBeenCalled();
});
