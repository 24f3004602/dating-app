import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";
import { Linking } from "react-native";

import { t } from "@/i18n/en";
import { DiscoverScreen } from "@/screens/discover";
import { UnreadNotices } from "@/screens/notices";
import { NotificationsScreen } from "@/screens/notifications";
import { SafetyScreen } from "@/screens/safety";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

// A plain object, so tests can set the app config (the real one exposes getters).
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} }, easConfig: undefined } }));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));

test("settings: categories save at once, and this test build says push isn't available yet", async () => {
  (Constants as { expoConfig: unknown }).expoConfig = { extra: {} };
  let prefs = { matches: true, messages: true, likes: true };
  const { api, calls } = fakeApi({
    "GET /v1/me/notifications": () => ({ status: 200, body: prefs }),
    "PUT /v1/me/notifications": (req) => {
      prefs = req.body as typeof prefs;
      return { status: 200, body: prefs };
    },
  });
  await renderWithApp(<NotificationsScreen />, api);
  expect(await screen.findByText(t.notifications.intro)).toBeTruthy();
  await fireEvent(screen.getByRole("switch", { name: t.notifications.messages, checked: true }), "valueChange", false);
  await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ matches: true, messages: false, likes: true }));
  expect(await screen.findByRole("switch", { name: t.notifications.messages, checked: false })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.notifications.enable }));
  expect(await screen.findByText(t.notifications.notConfigured)).toBeTruthy();
  expect(screen.getByText(t.notifications.alwaysNotices)).toBeTruthy();
});

test("NOTICE-APP-1: new documents and the rules reminder show on Today with their links, and Got it clears each", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const read: Record<string, boolean> = { n1: false, n2: false };
  const { api, calls } = fakeApi({
    "GET /v1/me/notices": () => ({
      status: 200,
      body: [
        { id: "n1", kind: "new_documents", version: "beta-2026-11-25", created_at: "2026-11-26T03:30:00Z", read: read.n1 },
        { id: "n2", kind: "rules_reminder", version: null, created_at: "2026-11-26T03:30:00Z", read: read.n2 },
        { id: "n0", kind: "warning", version: null, created_at: "2026-11-01T09:00:00Z", read: true },
      ],
    }),
    "POST /v1/me/notices/n1/read": () => {
      read.n1 = true;
      return { status: 204 };
    },
    "POST /v1/me/notices/n2/read": () => {
      read.n2 = true;
      return { status: 204 };
    },
  });
  await renderWithApp(<UnreadNotices />, api);
  expect(await screen.findByText(`${t.notices.unread}: ${t.notices.new_documents} (2026-11-26)`)).toBeTruthy();
  expect(screen.getByText(`${t.notices.unread}: ${t.notices.rules_reminder} (2026-11-26)`)).toBeTruthy();
  expect(screen.queryByText(`${t.notices.warning} (2026-11-01)`)).toBeNull(); // read: only in Safety now
  // The terms for both, the privacy notice for the new documents.
  expect(screen.getAllByRole("link", { name: t.signUp.readTerms })).toHaveLength(2);
  await fireEvent.press(screen.getByRole("link", { name: t.signUp.readPrivacy }));
  expect(open).toHaveBeenCalledWith("http://127.0.0.1:3000/privacy");

  await fireEvent.press(screen.getAllByRole("button", { name: t.notices.gotIt })[0]!);
  await waitFor(() => expect(screen.getAllByRole("button", { name: t.notices.gotIt })).toHaveLength(1));
  await fireEvent.press(screen.getByRole("button", { name: t.notices.gotIt }));
  await waitFor(() => expect(screen.queryByText(t.notices.title)).toBeNull()); // all read: the panel goes
  expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
    "/v1/me/notices/n1/read",
    "/v1/me/notices/n2/read",
  ]);
});

test("NOTICE-APP-2: Today puts unread notices above the day's set", async () => {
  const { api } = fakeApi({
    "GET /v1/discovery/today": () => ({ status: 200, body: { cards: [], next_set_at: "2026-11-27T03:30:00Z" } }),
    "GET /v1/me/notices": () => ({
      status: 200,
      body: [{ id: "n1", kind: "new_documents", version: "beta-2026-11-25", created_at: "2026-11-26T03:30:00Z", read: false }],
    }),
  });
  await renderWithApp(<DiscoverScreen />, api);
  expect(await screen.findByText(`${t.notices.unread}: ${t.notices.new_documents} (2026-11-26)`)).toBeTruthy();
  expect(screen.getByText(t.discover.title)).toBeTruthy();
});

test("safety: a notice from the team is shown in fixed words and can be marked read", async () => {
  let read = false;
  const { api, calls } = fakeApi({
    "GET /v1/blocks": () => ({ status: 200, body: [] }),
    "GET /v1/reports/mine": () => ({ status: 200, body: [] }),
    "GET /v1/me/notices": () => ({ status: 200, body: [{ id: "n1", kind: "warning", created_at: "2026-11-05T09:00:00Z", read }] }),
    "POST /v1/me/notices/n1/read": () => {
      read = true;
      return { status: 204 };
    },
  });
  await renderWithApp(<SafetyScreen />, api);
  expect(await screen.findByText(`${t.notices.unread}: ${t.notices.warning} (2026-11-05)`)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.notices.markRead }));
  await waitFor(() => expect(screen.getByText(`${t.notices.warning} (2026-11-05)`)).toBeTruthy());
  expect(calls.some((c) => c.method === "POST" && c.path === "/v1/me/notices/n1/read")).toBe(true);
  expect(screen.queryByRole("button", { name: t.notices.markRead })).toBeNull();
});
