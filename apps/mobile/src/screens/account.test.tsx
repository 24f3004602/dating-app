import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { fill, t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { DeleteAccountScreen, deletionNotice } from "@/screens/account";
import { SignInScreen, WelcomeScreen } from "@/screens/auth";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Link: ({ children }: { children: unknown }) => children,
}));
beforeEach(() => jest.clearAllMocks());

const PASSWORD = "violet harbour lantern seventy";
const inAWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

/** Signs in first, like a member opening the screen. */
function SignedIn({ children }: { children: React.ReactNode }) {
  const { signIn, status } = useAuth();
  useEffect(() => {
    void signIn("member-token");
  }, [signIn]);
  return <>{status === "signedIn" ? children : null}</>;
}

test("deleting says what happens, needs the password, then signs out to the date", async () => {
  const purgeAfter = inAWeek();
  let answer: { status: number; body?: unknown } = problem(403, "password_incorrect");
  const { api, calls } = fakeApi({ "POST /v1/me/deletion": () => answer });
  await renderWithApp(
    <>
      <SignedIn>
        <DeleteAccountScreen />
      </SignedIn>
      <WelcomeScreen />
    </>,
    api,
  );
  for (const text of [t.account.now, t.account.later, t.account.kept, t.account.unreachable]) {
    expect(await screen.findByText(text)).toBeTruthy();
  }
  await fireEvent.press(screen.getByRole("button", { name: t.account.confirm }));
  expect(await screen.findByText("Enter your password.")).toBeTruthy();
  expect(calls).toHaveLength(0);

  await fireEvent.changeText(screen.getByLabelText(t.account.password), "not my password");
  await fireEvent.press(screen.getByRole("button", { name: t.account.confirm }));
  expect(await screen.findByText(t.errors.password_incorrect)).toBeTruthy();

  answer = { status: 202, body: { purge_after: purgeAfter } };
  await fireEvent.changeText(screen.getByLabelText(t.account.password), PASSWORD);
  await fireEvent.press(screen.getByRole("button", { name: t.account.confirm }));
  const goodbye = fill(t.account.goodbye, { date: dateInIndia(purgeAfter) });
  expect(await screen.findByText(goodbye)).toBeTruthy();
  expect(screen.queryByText(t.account.now)).toBeNull(); // signed out: the screen is gone
  expect(calls.map((c) => c.body)).toEqual([{ password: "not my password" }, { password: PASSWORD }]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("session_token");
});

test("signing in to an account waiting for deletion offers to keep it", async () => {
  const purgeAfter = inAWeek();
  const { api, calls } = fakeApi({
    "POST /v1/auth/login": () => problem(403, "deletion_scheduled", { purge_after: purgeAfter }),
    "POST /v1/auth/restore": () => ({ status: 200, body: { token: "kept-token" } }),
  });
  await renderWithApp(<SignInScreen />, api);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.email), "Asha@Example.com");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.password), PASSWORD);
  await fireEvent.press(screen.getByRole("button", { name: t.signIn.submit }));
  expect(await screen.findByText(fill(t.account.scheduled, { date: dateInIndia(purgeAfter) }))).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole("button", { name: t.account.keep }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/auth/login", "POST /v1/auth/restore"]);
  expect(calls[1]?.body).toEqual({ email: "asha@example.com", password: PASSWORD });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("session_token", "kept-token", expect.anything());
});

test("the deletion date is the India date, and isn't shown once it has passed", () => {
  const now = new Date("2026-11-05T09:00:00Z");
  expect(deletionNotice(t.account.scheduled, "2026-11-12T20:00:00Z", now)).toBe(
    fill(t.account.scheduled, { date: "2026-11-13" }), // 01:30 on the 13th in India
  );
  expect(deletionNotice(t.account.scheduled, "2026-11-05T08:00:00Z", now)).toBe(t.account.scheduledNoDate);
  expect(deletionNotice(t.account.scheduled, null, now)).toBe(t.account.scheduledNoDate);
});
