// WEB-SESS-APP-1, 3 (D152): the web app's session is the API's HttpOnly cookie. The requests
// that open a session ask for it; the page keeps no token and asks the API whether it's signed in.
import { screen } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { Text } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { cookieModeFor, keepSignedIn, setKeepSignedIn } from "@/auth/webSession";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

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

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
});
afterEach(() => setKeepSignedIn(true));

const LOGIN = "http://api.test/v1/auth/login";

test("WEB-SESS-APP-1: the requests that open a session ask for the cookie; the phone app never does", () => {
  expect(cookieModeFor("POST", LOGIN, false)).toBeNull();
  for (const path of ["/v1/auth/login", "/v1/auth/restore", "/v1/auth/verify-email", "/v1/auth/google", "/v1/auth/google/complete"]) {
    expect(cookieModeFor("POST", `http://api.test${path}`, true)).toBe("persistent");
  }
  expect(cookieModeFor("GET", "http://api.test/v1/auth/google", true)).toBeNull(); // Google's settings
  expect(cookieModeFor("POST", "http://api.test/v1/auth/logout", true)).toBeNull();
  expect(cookieModeFor("POST", "http://api.test/v1/likes", true)).toBeNull();

  // "Keep me signed in" off: a cookie that ends with the browser, remembered across Google's page.
  setKeepSignedIn(false);
  expect(cookieModeFor("POST", LOGIN, true)).toBe("browser");
  expect(sessionStorage.getItem("session.keep")).toBe("off");
  expect(keepSignedIn()).toBe(false);
});

function Status() {
  const { status } = useAuth();
  return <Text>{`status: ${status}`}</Text>;
}

test("WEB-SESS-APP-3: the web app asks the API whether this browser is still signed in", async () => {
  const signedIn = fakeApi({ "GET /v1/me": () => ({ status: 200, body: { id: "u1" } }) }, { value: null }, { cookies: true });
  const first = await renderWithApp(<Status />, signedIn.api, { cookieSessions: true });
  expect(await screen.findByText("status: signedIn")).toBeTruthy();
  expect(signedIn.calls[0]?.credentials).toBe("include");
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled(); // nothing is kept on the page
  await first.unmount();

  const signedOut = fakeApi({ "GET /v1/me": () => problem(401, "unauthenticated") }, { value: null }, { cookies: true });
  await renderWithApp(<Status />, signedOut.api, { cookieSessions: true });
  expect(await screen.findByText("status: signedOut")).toBeTruthy();
  expect(signedOut.onUnauthorized).not.toHaveBeenCalled(); // there was nothing to forget
});
