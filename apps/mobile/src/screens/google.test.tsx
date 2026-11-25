/** Sign in with Google in the app (D134): the button, a known member, someone new, keeping
 *  an account, the web app's return, and deleting an account that has no password. */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { googleSupported, startGoogleSignIn, takeGoogleReturn } from "@/auth/googleSignIn";
import { fill, t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { DeleteAccountScreen } from "@/screens/account";
import { SignInScreen, WelcomeScreen } from "@/screens/auth";
import { GoogleFinishScreen, GoogleReturnScreen } from "@/screens/google";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  ...require("@/test/expoRouter").expoRouterInPlace(),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/auth/googleSignIn", () => ({
  googleSupported: jest.fn(() => true),
  startGoogleSignIn: jest.fn(),
  takeGoogleReturn: jest.fn(),
}));
const supported = googleSupported as jest.Mock;
const start = startGoogleSignIn as jest.Mock;
const back = takeGoogleReturn as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  supported.mockReturnValue(true);
  mockParams.current = {};
});

const CLIENT = "123456789012-testclient.apps.googleusercontent.com";
const ON = { status: 200, body: { enabled: true, client_id: CLIENT, redirect_uri: "https://app.example.in/auth/google" } };
const OFF = { status: 200, body: { enabled: false, client_id: null, redirect_uri: null } };
const SESSION = { token: "google-session", expires_at: "2026-12-19T00:00:00Z", user: {} };
const now = () => new Date(Date.UTC(2026, 10, 3, 19, 0)); // 4 Nov 2026 in India
const inAWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const googleCalls = <T extends { method: string }>(calls: T[]) => calls.filter((c) => c.method === "POST");

test("Google's button shows where the API offers it and this device can use it", async () => {
  const { api } = fakeApi({ "GET /v1/auth/google": () => ON });
  await renderWithApp(<SignInScreen />, api);
  expect(await screen.findByRole("button", { name: t.google.button })).toBeTruthy();
});

test("no button where the API doesn't offer Google", async () => {
  const { api, calls } = fakeApi({ "GET /v1/auth/google": () => OFF });
  await renderWithApp(<SignInScreen />, api);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(screen.queryByRole("button", { name: t.google.button })).toBeNull();
});

test("a phone build without Google's native part doesn't even ask", async () => {
  supported.mockReturnValue(false);
  const { api, calls } = fakeApi({ "GET /v1/auth/google": () => ON });
  await renderWithApp(<SignInScreen />, api);
  expect(await screen.findByRole("button", { name: t.signIn.submit })).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.google.button })).toBeNull();
  expect(calls).toHaveLength(0);
});

test("a member Google already knows is signed in straight away", async () => {
  start.mockResolvedValue({ kind: "token", idToken: "id-token-from-google" });
  const { api, calls } = fakeApi({
    "GET /v1/auth/google": () => ON,
    "POST /v1/auth/google": () => ({ status: 200, body: { session: SESSION } }),
  });
  await renderWithApp(<SignInScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.google.button }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(start).toHaveBeenCalledWith({
    clientId: CLIENT, redirectUri: "https://app.example.in/auth/google", purpose: "sign-in", restore: false, from: "/sign-in",
  });
  expect(googleCalls(calls).map((c) => c.body)).toEqual([{ id_token: "id-token-from-google", restore: false }]);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("session_token", "google-session", expect.anything());
});

test("someone new finishes with a date of birth (18+) and the documents", async () => {
  start.mockResolvedValue({ kind: "token", idToken: "id-token-from-google" });
  const { api, calls } = fakeApi({
    "GET /v1/auth/google": () => ON,
    "POST /v1/auth/google": () => ({ status: 200, body: { session: null, ticket: "signed-ticket", email: "asha@gmail.com", name: "Asha" } }),
    "POST /v1/auth/google/complete": () => ({ status: 201, body: SESSION }),
  });
  await renderWithApp(
    <>
      <WelcomeScreen />
      <GoogleFinishScreen now={now} />
    </>,
    api,
  );
  expect(screen.getByText(t.google.finishLost)).toBeTruthy(); // no ticket yet (a reload loses it)
  await fireEvent.press(await screen.findByRole("button", { name: t.google.button }));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/google-finish"));
  expect(await screen.findByText(fill(t.google.finishBody, { email: "asha@gmail.com" }))).toBeTruthy();

  const fill_ = async (day: string) => {
    await fireEvent.changeText(screen.getByLabelText(t.signUp.day), day);
    await fireEvent.changeText(screen.getByLabelText(t.signUp.month), "11");
    await fireEvent.changeText(screen.getByLabelText(t.signUp.year), "2008");
  };
  await fill_("5"); // 18 tomorrow
  await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.terms }));
  await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.privacy }));
  await fireEvent.press(screen.getByRole("button", { name: t.google.submit }));
  expect(await screen.findByText("You must be 18 or older to join.")).toBeTruthy();
  expect(calls.some((c) => c.path === "/v1/auth/google/complete")).toBe(false);

  await fill_("4"); // 18 today
  await fireEvent.press(screen.getByRole("button", { name: t.google.submit }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(calls.find((c) => c.path === "/v1/auth/google/complete")?.body).toEqual({
    ticket: "signed-ticket",
    birthdate: "2008-11-04",
    consents: { terms: "draft-2026-11", privacy: "draft-2026-11" },
  });
});

test("DOC-VER-APP-3: finishing with Google adopts newer documents the same way", async () => {
  start.mockResolvedValue({ kind: "token", idToken: "id-token-from-google" });
  const current = { terms: "beta-2026-11-25", privacy: "beta-2026-11-25" };
  let attempt = 0;
  const { api, calls } = fakeApi({
    "GET /v1/auth/google": () => ON,
    "POST /v1/auth/google": () => ({ status: 200, body: { session: null, ticket: "signed-ticket", email: "asha@gmail.com", name: "Asha" } }),
    "POST /v1/auth/google/complete": () =>
      ++attempt === 1 ? problem(422, "consent_required", { required: current }) : { status: 201, body: SESSION },
  });
  await renderWithApp(
    <>
      <WelcomeScreen />
      <GoogleFinishScreen now={now} />
    </>,
    api,
  );
  await fireEvent.press(await screen.findByRole("button", { name: t.google.button }));
  expect(await screen.findByText(fill(t.google.finishBody, { email: "asha@gmail.com" }))).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText(t.signUp.day), "1");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.month), "1");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.year), "1995");
  const agree = async () => {
    await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.terms }));
    await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.privacy }));
  };
  await agree();
  await fireEvent.press(screen.getByRole("button", { name: t.google.submit }));
  expect(await screen.findByText(t.signUp.documentsChanged)).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: t.signUp.terms, checked: false })).toBeTruthy();
  await agree();
  await fireEvent.press(screen.getByRole("button", { name: t.google.submit }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  const sent = calls.filter((c) => c.path === "/v1/auth/google/complete").map((c) => (c.body as { consents: unknown }).consents);
  expect(sent).toEqual([{ terms: "draft-2026-11", privacy: "draft-2026-11" }, current]);
});

test("an account waiting to be deleted is kept with the same Google answer, only when asked", async () => {
  const purgeAfter = inAWeek();
  start.mockResolvedValue({ kind: "token", idToken: "id-token-from-google" });
  const { api, calls } = fakeApi({
    "GET /v1/auth/google": () => ON,
    "POST /v1/auth/google": (req) =>
      (req.body as { restore: boolean }).restore
        ? { status: 200, body: { session: SESSION } }
        : problem(403, "deletion_scheduled", { purge_after: purgeAfter }),
  });
  await renderWithApp(<SignInScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.google.button }));
  expect(await screen.findByText(fill(t.account.scheduled, { date: dateInIndia(purgeAfter) }))).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: t.account.keep }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(start).toHaveBeenCalledTimes(1); // Google isn't asked twice
  expect(googleCalls(calls).map((c) => c.body)).toEqual([
    { id_token: "id-token-from-google", restore: false },
    { id_token: "id-token-from-google", restore: true },
  ]);
});

test("cancelling says nothing; a phone without Google says so; the API's refusal is explained", async () => {
  const { api, calls } = fakeApi({
    "GET /v1/auth/google": () => ON,
    "POST /v1/auth/google": () => problem(409, "google_link_refused"),
  });
  await renderWithApp(<SignInScreen />, api);
  const button = await screen.findByRole("button", { name: t.google.button });
  start.mockResolvedValueOnce({ kind: "cancelled" });
  await fireEvent.press(button);
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(t.google.failed)).toBeNull();
  expect(googleCalls(calls)).toHaveLength(0);

  start.mockResolvedValueOnce({ kind: "unavailable" });
  await fireEvent.press(button);
  expect(await screen.findByText(t.google.unavailable)).toBeTruthy();

  start.mockResolvedValueOnce({ kind: "token", idToken: "id-token-from-google" });
  await fireEvent.press(button);
  expect(await screen.findByText(t.errors.google_link_refused)).toBeTruthy();
});

test("the web app, back from Google: the code and its verifier go to the API", async () => {
  back.mockReturnValue({ kind: "code", code: "code-from-google", verifier: "v".repeat(43), purpose: "sign-in", restore: false, from: "/sign-in" });
  const { api, calls } = fakeApi({ "POST /v1/auth/google": () => ({ status: 200, body: { session: SESSION } }) });
  mockParams.current = { code: "code-from-google", state: "s" };
  await renderWithApp(<GoogleReturnScreen />, api);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(back).toHaveBeenCalledTimes(1); // the answer is taken once
  expect(back).toHaveBeenCalledWith({ code: "code-from-google", state: "s", error: undefined });
  expect(googleCalls(calls).map((c) => c.body)).toEqual([{ code: "code-from-google", code_verifier: "v".repeat(43), restore: false }]);
});

test("the web app, back from a cancelled Google page: where it started", async () => {
  back.mockReturnValue({ kind: "cancelled", from: "/sign-up" });
  const { api, calls } = fakeApi({});
  await renderWithApp(<GoogleReturnScreen />, api);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/sign-up"));
  expect(googleCalls(calls)).toHaveLength(0);
});

test("the web app, back with an answer to someone else's request: nothing is sent", async () => {
  back.mockReturnValue({ kind: "failed", from: "/welcome" });
  const { api, calls } = fakeApi({});
  await renderWithApp(<GoogleReturnScreen />, api);
  expect(await screen.findByText(t.google.failed)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.google.back }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith("/welcome");
  expect(googleCalls(calls)).toHaveLength(0);
});

/** Signs in first, like a member opening the screen. */
function SignedIn({ children }: { children: React.ReactNode }) {
  const { signIn, status } = useAuth();
  useEffect(() => {
    void signIn("member-token");
  }, [signIn]);
  return <>{status === "signedIn" ? children : null}</>;
}

test("an account without a password is deleted by choosing the same Google account again", async () => {
  const purgeAfter = inAWeek();
  let answer: { status: number; body?: unknown } = problem(403, "google_mismatch");
  start.mockResolvedValue({ kind: "token", idToken: "fresh-id-token" });
  const { api, calls } = fakeApi({
    "GET /v1/me": () => ({ status: 200, body: { has_password: false } }),
    "GET /v1/auth/google": () => ON,
    "POST /v1/me/deletion": () => answer,
  });
  await renderWithApp(
    <>
      <SignedIn>
        <DeleteAccountScreen />
      </SignedIn>
      <WelcomeScreen />
    </>,
    api,
  );
  expect(await screen.findByText(t.account.withGoogle)).toBeTruthy();
  expect(screen.queryByLabelText(t.account.password)).toBeNull(); // no password to ask for
  const confirm = screen.getByRole("button", { name: t.account.confirm });
  await fireEvent.press(confirm);
  expect(await screen.findByText(t.errors.google_mismatch)).toBeTruthy();
  expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ purpose: "delete", from: "/delete-account" }));

  answer = { status: 202, body: { purge_after: purgeAfter } };
  await fireEvent.press(screen.getByRole("button", { name: t.account.confirm }));
  expect(await screen.findByText(fill(t.account.goodbye, { date: dateInIndia(purgeAfter) }))).toBeTruthy();
  expect(calls.filter((c) => c.path === "/v1/me/deletion").map((c) => c.body)).toEqual([
    { google: { id_token: "fresh-id-token" } },
    { google: { id_token: "fresh-id-token" } },
  ]);
});

test("the web app's deletion finishes on its return from Google, for a signed-in member", async () => {
  const purgeAfter = inAWeek();
  back.mockReturnValue({ kind: "code", code: "code-from-google", verifier: "w".repeat(43), purpose: "delete", restore: false, from: "/delete-account" });
  const { api, calls } = fakeApi({ "POST /v1/me/deletion": () => ({ status: 202, body: { purge_after: purgeAfter } }) });
  await renderWithApp(
    <SignedIn>
      <GoogleReturnScreen />
    </SignedIn>,
    api,
  );
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/welcome"));
  expect(googleCalls(calls).map((c) => c.body)).toEqual([{ google: { code: "code-from-google", code_verifier: "w".repeat(43) } }]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("session_token");
});
