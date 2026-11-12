import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";

import { t } from "@/i18n/en";
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
