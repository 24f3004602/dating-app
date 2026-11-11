import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { color } from "@/theme/tokens";
import { DiscoverScreen, PersonScreen, PreferencesScreen } from "@/screens/discover";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
beforeEach(() => jest.clearAllMocks());

const photo = (id: string) => ({
  id, position: 0, moderation_state: "approved", width: 1080, height: 1350,
  urls: { large: `/v1/media/blob/p/${id}/l.jpg?exp=1&sig=x`, small: `/v1/media/blob/p/${id}/s.jpg?exp=1&sig=x` },
  urls_expire_at: "2026-11-04T12:00:00Z",
});  // prettier-ignore
const card = (id: string, name: string, distance: string, rank: number) => ({
  user_id: id, display_name: name, age: 29, gender: "man", intent: "long_term", bio: "Hello.",
  area: { id: "delhi.saket", city: "Delhi", name: "Saket" }, prompts: [], photos: [photo(`${id}p`)], distance, rank,
});  // prettier-ignore
const TODAY = (cards: unknown[]) => ({
  date: "2026-11-04", cards, size_limit: 15, next_set_at: "2026-11-04T18:30:00Z", // midnight in India
});

test("today's cards show a distance bucket and open the person", async () => {
  const { api } = fakeApi({
    "GET /v1/discovery/today": () => ({ status: 200, body: TODAY([card("u1", "Aarav", "under_5_km", 1), card("u2", "Kabir", "15_to_50_km", 2)]) }),
  });
  await renderWithApp(<DiscoverScreen />, api);
  expect(await screen.findByText("Aarav, 29")).toBeTruthy();
  expect(screen.getByText("Saket, under 5 km away")).toBeTruthy();
  expect(screen.getByText("Saket, 15 to 50 km away")).toBeTruthy();
  expect(screen.queryByText(/\d+\.\d+\s?km/)).toBeNull(); // never an exact distance
  // The name is lettered on a graphite plate (stage 20e, D105).
  expect(StyleSheet.flatten(screen.getByText("Aarav, 29").props.style).color).toBe(color.onSign);
  // The set is finite: it ends by saying when the next one arrives (India time).
  expect(screen.getByText(t.discover.end.replace("{time}", "00:00"))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /Aarav, 29/ }));
  expect(mockRouter.push).toHaveBeenCalledWith("/person/u1");
});

test("an empty set says when the next one arrives (India time)", async () => {
  const { api } = fakeApi({ "GET /v1/discovery/today": () => ({ status: 200, body: TODAY([]) }) });
  await renderWithApp(<DiscoverScreen />, api);
  expect(await screen.findByText(t.discover.empty.replace("{time}", "00:00"))).toBeTruthy();
  expect(screen.queryByText(t.discover.end.replace("{time}", "00:00"))).toBeNull(); // said once, not twice
});

test.each([
  ["profile_incomplete", t.discover.incompleteTitle, t.discover.toPhotos, "/photos"],
  ["discovery_paused", t.discover.pausedTitle, t.discover.toPrivacy, "/privacy"],
])("a %s answer explains what to do", async (code, title, button, route) => {
  const { api } = fakeApi({ "GET /v1/discovery/today": () => problem(409, code) });
  await renderWithApp(<DiscoverScreen />, api);
  expect(await screen.findByText(title)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: button }));
  expect(mockRouter.push).toHaveBeenCalledWith(route);
});

test("a person's profile, and a clear state when it is no longer available", async () => {
  const { api } = fakeApi({
    "GET /v1/profiles/u1": () => ({ status: 200, body: { ...card("u1", "Aarav", "under_5_km", 1), prompts: [{ key: "festival", text: "The festival I look forward to all year", answer: "Holi." }] } }),
    "GET /v1/profiles/u2": () => problem(404, "not_found"),
  });
  await renderWithApp(<PersonScreen id="u1" />, api);
  expect(await screen.findByText("Aarav, 29")).toBeTruthy();
  expect(screen.getByLabelText("Photo 1 of 1 of Aarav")).toBeTruthy();
  expect(screen.getByText("Holi.")).toBeTruthy();
  await screen.unmount();
  await renderWithApp(<PersonScreen id="u2" />, api);
  expect(await screen.findByText(t.person.gone)).toBeTruthy();
});

test("preferences: load, validate, save the API's shape", async () => {
  const { api, calls } = fakeApi({
    "GET /v1/me/preferences": () => ({ status: 200, body: { age_min: 18, age_max: 99, max_distance_km: null, applies_from: "next_set" } }),
    "PUT /v1/me/preferences": (req) => ({ status: 200, body: { ...(req.body as object), applies_from: "next_set" } }),
  });
  await renderWithApp(<PreferencesScreen />, api);
  await fireEvent.changeText(await screen.findByLabelText(t.preferences.ageMin), "35");
  await fireEvent.changeText(screen.getByLabelText(t.preferences.ageMax), "30");
  await fireEvent.press(screen.getByRole("button", { name: t.common.save }));
  expect(await screen.findByText(t.preferences.ageOrder)).toBeTruthy();
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);

  await fireEvent.changeText(screen.getByLabelText(t.preferences.ageMin), "25");
  await fireEvent.press(screen.getByRole("radio", { name: "Within 15 km" }));
  await fireEvent.press(screen.getByRole("button", { name: t.common.save }));
  expect(await screen.findByText(t.preferences.saved)).toBeTruthy();
  await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ age_min: 25, age_max: 30, max_distance_km: 15 }));
});
