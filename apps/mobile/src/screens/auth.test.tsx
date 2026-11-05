import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Linking } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { t } from "@/i18n/en";
import { ResetScreen, SignInScreen, SignUpScreen, VerifyScreen } from "@/screens/auth";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Link: ({ children }: { children: unknown }) => children,
}));

beforeEach(() => jest.clearAllMocks());

const PASSWORD = "violet harbour lantern seventy";
const now = () => new Date(Date.UTC(2026, 10, 3, 19, 0)); // 4 Nov 2026 in India

async function fillSignUp(day: string, month: string, year: string) {
  await fireEvent.changeText(screen.getByLabelText(t.signUp.email), "  Asha@Example.com ");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.password), PASSWORD);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.day), day);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.month), month);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.year), year);
  await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.terms }));
  await fireEvent.press(screen.getByRole("checkbox", { name: t.signUp.privacy }));
}

test("sign-up refuses under-18s before anything is sent", async () => {
  const { api, calls } = fakeApi({});
  await renderWithApp(<SignUpScreen now={now} />, api);
  await fillSignUp("5", "11", "2008"); // turns 18 tomorrow in India
  await fireEvent.press(screen.getByRole("button", { name: t.signUp.submit }));
  expect(await screen.findByText("You must be 18 or older to join.")).toBeTruthy();
  expect(calls).toHaveLength(0);
});

test("sign-up sends a normalised body with the consent versions, then asks for the code", async () => {
  const { api, calls } = fakeApi({ "POST /v1/auth/register": () => ({ status: 202, body: { status: "accepted" } }) });
  await renderWithApp(<SignUpScreen now={now} />, api);
  await fillSignUp("4", "11", "2008"); // exactly 18 today in India
  await fireEvent.press(screen.getByRole("button", { name: t.signUp.submit }));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/verify"));
  expect(calls[0]?.body).toEqual({
    email: "asha@example.com",
    password: PASSWORD,
    birthdate: "2008-11-04",
    consents: { terms: "draft-2026-11", privacy: "draft-2026-11" },
  });
});

test("sign-up links to the terms and the privacy notice, opened in the browser", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const { api } = fakeApi({});
  await renderWithApp(<SignUpScreen now={now} />, api);
  await fireEvent.press(screen.getByRole("link", { name: t.signUp.readTerms }));
  await fireEvent.press(screen.getByRole("link", { name: t.signUp.readPrivacy }));
  expect(open.mock.calls).toEqual([["http://127.0.0.1:3000/terms"], ["http://127.0.0.1:3000/privacy"]]);
  expect(screen.getByText(t.signUp.draftNotice)).toBeTruthy(); // development documents
});

test("sign-up shows the app's message for a server rejection", async () => {
  const { api } = fakeApi({ "POST /v1/auth/register": () => problem(422, "weak_password", { problems: ["breached"] }) });
  await renderWithApp(<SignUpScreen now={now} />, api);
  await fillSignUp("1", "1", "1995");
  await fireEvent.press(screen.getByRole("button", { name: t.signUp.submit }));
  expect(await screen.findByText(t.errors.weak_password)).toBeTruthy();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

function WithPending({ children }: { children: React.ReactNode }) {
  const { pending, setPending } = useAuth();
  useEffect(() => {
    if (!pending) setPending({ email: "asha@example.com", password: PASSWORD });
  }, [pending, setPending]);
  return pending ? <>{children}</> : null;
}

test("verification sends the code with the remembered password and stores the session securely", async () => {
  const { api, calls } = fakeApi({
    "POST /v1/auth/verify-email": () => ({ status: 201, body: { token: "new-session-token", token_type: "bearer" } }),
  });
  await renderWithApp(
    <WithPending>
      <VerifyScreen />
    </WithPending>,
    api,
  );
  await fireEvent.changeText(await screen.findByLabelText(t.verify.code), "123456");
  await fireEvent.press(screen.getByRole("button", { name: t.verify.submit }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(calls[0]?.body).toEqual({ email: "asha@example.com", code: "123456", password: PASSWORD });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("session_token", "new-session-token", expect.anything());
});

test("verification without a pending sign-up offers to start again", async () => {
  const { api } = fakeApi({});
  await renderWithApp(<VerifyScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.verify.restart }));
  expect(mockRouter.replace).toHaveBeenCalledWith("/sign-up");
});

test("a wrong code keeps the member on the screen with a clear message", async () => {
  const { api } = fakeApi({ "POST /v1/auth/verify-email": () => problem(400, "verification_failed") });
  await renderWithApp(
    <WithPending>
      <VerifyScreen />
    </WithPending>,
    api,
  );
  await fireEvent.changeText(await screen.findByLabelText(t.verify.code), "000000");
  await fireEvent.press(screen.getByRole("button", { name: t.verify.submit }));
  expect(await screen.findByText(t.verify.failed)).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test("sign-in maps invalid credentials and validates locally first", async () => {
  const { api, calls } = fakeApi({ "POST /v1/auth/login": () => problem(401, "invalid_credentials") });
  await renderWithApp(<SignInScreen />, api);
  await fireEvent.press(screen.getByRole("button", { name: t.signIn.submit }));
  expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
  expect(calls).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.email), "asha@example.com");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.password), "wrong password here");
  await fireEvent.press(screen.getByRole("button", { name: t.signIn.submit }));
  expect(await screen.findByText(t.signIn.invalid)).toBeTruthy();
});

test("sign-in success stores the session and opens the profile", async () => {
  const { api, calls } = fakeApi({ "POST /v1/auth/login": () => ({ status: 200, body: { token: "signed-in-token" } }) });
  await renderWithApp(<SignInScreen />, api);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.email), " Asha@Example.com");
  await fireEvent.changeText(screen.getByLabelText(t.signUp.password), PASSWORD);
  await fireEvent.press(screen.getByRole("button", { name: t.signIn.submit }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/profile"));
  expect(calls[0]?.body).toEqual({ email: "asha@example.com", password: PASSWORD });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("session_token", "signed-in-token", expect.anything());
});

test("password reset: request, then code and a new password checked locally", async () => {
  const { api, calls } = fakeApi({
    "POST /v1/auth/password-reset/request": () => ({ status: 202, body: { status: "accepted" } }),
    "POST /v1/auth/password-reset/confirm": () => ({ status: 204 }),
  });
  await renderWithApp(<ResetScreen />, api);
  await fireEvent.changeText(screen.getByLabelText(t.signUp.email), "asha@example.com");
  await fireEvent.press(screen.getByRole("button", { name: t.reset.send }));
  expect(await screen.findByText(t.reset.sent)).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText(t.reset.code), "123456");
  await fireEvent.changeText(screen.getByLabelText(t.reset.newPassword), "too short");
  await fireEvent.press(screen.getByRole("button", { name: t.reset.submit }));
  expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
  expect(calls.filter((c) => c.path.endsWith("/confirm"))).toHaveLength(0);

  await fireEvent.changeText(screen.getByLabelText(t.reset.newPassword), "copper meadow kettle ninety");
  await fireEvent.press(screen.getByRole("button", { name: t.reset.submit }));
  expect(await screen.findByText(t.reset.done)).toBeTruthy();
  expect(calls.find((c) => c.path.endsWith("/confirm"))?.body).toEqual({
    email: "asha@example.com",
    code: "123456",
    new_password: "copper meadow kettle ninety",
  });
});
