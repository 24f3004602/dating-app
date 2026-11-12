import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { color } from "@/theme/tokens";
import { EditProfileScreen, PhotosScreen, PrivacyScreen, ProfileScreen } from "@/screens/profile";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///photo.jpg", mimeType: "image/jpeg", fileName: "photo.jpg" }],
  })),
}));

beforeEach(() => jest.clearAllMocks());

const AREAS = [
  { id: "delhi.saket", city: "Delhi", name: "Saket" },
  { id: "noida.sector-18", city: "Noida", name: "Sector 18" },
];
const PROMPTS = [
  { key: "festival", text: "The festival I look forward to all year" },
  { key: "next_trip", text: "The next trip on my list" },
];
const photo = (id: string, position: number, state = "pending") => ({
  id, position, moderation_state: state, width: 1080, height: 720,
  urls: { large: `/v1/media/blob/p/${id}/l.jpg?exp=1&sig=x`, small: `/v1/media/blob/p/${id}/s.jpg?exp=1&sig=x` },
  urls_expire_at: "2026-11-04T12:00:00Z",
});  // prettier-ignore
const PROFILE = {
  user_id: "u1", display_name: "Asha", age: 27, gender: "woman", interested_in: ["man"], intent: "long_term",
  bio: null, area: AREAS[0], prompts: [], photos: [photo("p1", 0)], visibility: "everyone", discovery_paused: false,
  readiness: { ready: false, missing: ["approved_photos"], approved_photos: 0, approved_photos_needed: 2 },
};  // prettier-ignore
const ME = { verification: { age: "declared", email: "verified", identity: "not_checked" } };

test("profile: an empty state invites creating one", async () => {
  const { api } = fakeApi({
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
    "GET /v1/me": () => ({ status: 200, body: ME }),
  });
  await renderWithApp(<ProfileScreen />, api);
  expect(await screen.findByText(t.profile.emptyTitle)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.profile.create }));
  expect(mockRouter.push).toHaveBeenCalledWith("/profile/edit");
  // Deleting the account doesn't need a profile.
  await fireEvent.press(screen.getByRole("button", { name: t.profile.deleteAccount }));
  expect(mockRouter.push).toHaveBeenCalledWith("/delete-account");
});

test("profile: readiness and honest labels, never 'age verified'", async () => {
  const { api } = fakeApi({
    "GET /v1/me/profile": () => ({ status: 200, body: PROFILE }),
    "GET /v1/me": () => ({ status: 200, body: ME }),
  });
  await renderWithApp(<ProfileScreen />, api);
  expect(await screen.findByText("Asha, 27")).toBeTruthy();
  expect(screen.getByText(/Not visible to others yet/)).toBeTruthy();
  expect(await screen.findByText(`${t.profile.ageDeclared} · ${t.profile.emailVerified} · ${t.profile.identityNotChecked}`)).toBeTruthy();
  expect(screen.queryByText(/age verified/i)).toBeNull();
});

test("profile: a failed load offers a retry", async () => {
  let attempts = 0;
  const { api } = fakeApi({
    "GET /v1/me/profile": () => (++attempts === 1 ? problem(503, "service_unavailable") : { status: 200, body: PROFILE }),
    "GET /v1/me": () => ({ status: 200, body: ME }),
  });
  await renderWithApp(<ProfileScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.common.retry }));
  expect(await screen.findByText("Asha, 27")).toBeTruthy();
});

test("edit profile: required fields are checked before saving", async () => {
  const { api, calls } = fakeApi({
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
    "GET /v1/areas": () => ({ status: 200, body: AREAS }),
    "GET /v1/prompts": () => ({ status: 200, body: PROMPTS }),
  });
  await renderWithApp(<EditProfileScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.common.save }));
  expect(await screen.findByText("Enter your first name.")).toBeTruthy();
  expect(screen.getByText("Choose what you're looking for.")).toBeTruthy();
  expect(screen.getByText("Choose your area.")).toBeTruthy();
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});

test("edit profile: a complete form saves the API's shape", async () => {
  const { api, calls } = fakeApi({
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
    "GET /v1/areas": () => ({ status: 200, body: AREAS }),
    "GET /v1/prompts": () => ({ status: 200, body: PROMPTS }),
    "PUT /v1/me/profile": () => ({ status: 200, body: PROFILE }),
  });
  await renderWithApp(<EditProfileScreen />, api);
  await fireEvent.changeText(await screen.findByLabelText(t.editProfile.name), "Asha");
  await fireEvent.press(screen.getAllByRole("radio", { name: t.gender.woman })[0]!);
  await fireEvent.press(screen.getByRole("checkbox", { name: t.gender.man }));
  await fireEvent.press(screen.getByRole("radio", { name: t.intent.long_term }));
  await fireEvent.press(screen.getByRole("radio", { name: "Saket, Delhi" }));
  await fireEvent.press(screen.getByRole("radio", { name: PROMPTS[0]!.text }));
  await fireEvent.changeText(screen.getByLabelText(t.editProfile.answer), "Holi, for the colours.");
  await fireEvent.press(screen.getByRole("button", { name: t.common.save }));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
    display_name: "Asha", gender: "woman", interested_in: ["man"], intent: "long_term", bio: null,
    area_id: "delhi.saket", prompts: [{ key: "festival", answer: "Holi, for the colours." }],
  });  // prettier-ignore
});

test("edit profile: the area limit gets a clear message", async () => {
  const { api } = fakeApi({
    "GET /v1/me/profile": () => ({ status: 200, body: PROFILE }),
    "GET /v1/areas": () => ({ status: 200, body: AREAS }),
    "GET /v1/prompts": () => ({ status: 200, body: PROMPTS }),
    "PUT /v1/me/profile": () => problem(429, "area_change_limited"),
  });
  await renderWithApp(<EditProfileScreen />, api);
  await fireEvent.press(await screen.findByRole("radio", { name: "Sector 18, Noida" }));
  await fireEvent.press(screen.getByRole("button", { name: t.common.save }));
  expect(await screen.findByText(t.editProfile.areaLimited)).toBeTruthy();
});

test("photos: list, upload from the picker, reorder and delete", async () => {
  let photos = [photo("p1", 0), photo("p2", 1, "approved")];
  const { api, calls } = fakeApi({
    "GET /v1/me/photos": () => ({ status: 200, body: photos }),
    "POST /v1/me/photos": () => {
      photos = [...photos, photo("p3", 2)];
      return { status: 201, body: photos[2] };
    },
    "PATCH /v1/me/photos/order": (req) => {
      const ids = (req.body as { photo_ids: string[] }).photo_ids;
      photos = ids.map((id, i) => ({ ...photos.find((p) => p.id === id)!, position: i }));
      return { status: 200, body: photos };
    },
    "DELETE /v1/me/photos/p1": () => {
      photos = photos.filter((p) => p.id !== "p1");
      return { status: 204 };
    },
    "GET /v1/me/profile": () => ({ status: 200, body: PROFILE }),
  });
  await renderWithApp(<PhotosScreen />, api);
  expect(await screen.findByLabelText("Your photo 1 of 2")).toBeTruthy();
  expect(screen.getByText(t.photos.pending)).toBeTruthy();
  expect(screen.getByText(t.photos.approved)).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: t.photos.add }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/v1/me/photos")).toBe(true));
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ exif: false }));
  expect(await screen.findByLabelText("Your photo 3 of 3")).toBeTruthy();

  await fireEvent.press(screen.getAllByRole("button", { name: t.photos.moveDown })[0]!);
  await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ photo_ids: ["p2", "p1", "p3"] }));

  const deleteButtons = await screen.findAllByRole("button", { name: t.photos.remove });
  await fireEvent.press(deleteButtons[1]!); // p1 is now second
  await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/v1/me/photos/p1")).toBe(true));
  expect(await screen.findByLabelText("Your photo 2 of 2")).toBeTruthy();
});

test("photos: a refused upload shows why", async () => {
  const { api } = fakeApi({
    "GET /v1/me/photos": () => ({ status: 200, body: [] }),
    "POST /v1/me/photos": () => problem(422, "animated_image"),
  });
  await renderWithApp(<PhotosScreen />, api);
  expect(await screen.findByText(t.photos.empty)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.photos.add }));
  expect(await screen.findByText(t.errors.animated_image)).toBeTruthy();
});

test("privacy: choosing a setting saves it at once", async () => {
  let current = { ...PROFILE };
  const { api, calls } = fakeApi({
    "GET /v1/me/profile": () => ({ status: 200, body: current }),
    "PATCH /v1/me/privacy": (req) => {
      current = { ...current, ...(req.body as object) };
      return { status: 200, body: current };
    },
  });
  await renderWithApp(<PrivacyScreen />, api);
  await fireEvent.press(await screen.findByRole("radio", { name: t.privacy.likedOnly }));
  await fireEvent.press(screen.getByRole("checkbox", { name: t.privacy.pause }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([
    { visibility: "liked_only" },
    { discovery_paused: true },
  ]);
  expect(screen.getByRole("radio", { name: t.privacy.likedOnly })).toBeChecked();
  // What each setting does, and the way to delete the account.
  expect(screen.getByText(t.privacy.likedOnlyHint)).toBeTruthy();
  expect(screen.getByText(t.privacy.pauseHint)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.privacy.deleteOpen }));
  expect(mockRouter.push).toHaveBeenCalledWith("/delete-account");
});

test("You is your card over a list of places, not a hub of buttons (MOB-25, stage 20e)", async () => {
  const { api } = fakeApi({
    "GET /v1/me/profile": () => ({ status: 200, body: PROFILE }),
    "GET /v1/me": () => ({ status: 200, body: ME }),
  });
  await renderWithApp(<ProfileScreen />, api);
  // The name on a plate beside the cover, as on Today.
  expect(StyleSheet.flatten((await screen.findByText("Asha, 27")).props.style).color).toBe(color.onSign);
  expect(screen.getByLabelText(t.photos.coverAlt).props.role).toBe("img");
  // Each place is a row that says what it holds, and opens its screen.
  expect(within(screen.getByRole("button", { name: t.profile.photos })).getByText("1 of 6 photos")).toBeTruthy();
  expect(within(screen.getByRole("button", { name: t.profile.privacy })).getByText(t.privacy.everyone)).toBeTruthy();
  const places = [
    [t.profile.edit, "/profile/edit"],
    [t.profile.photos, "/photos"],
    [t.preferences.open, "/preferences"],
    [t.profile.privacy, "/privacy"],
    [t.safety.open, "/safety"],
    [t.notifications.open, "/notifications"],
    [t.profile.deleteAccount, "/delete-account"],
  ] as const;
  for (const [name, href] of places) {
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(href);
  }
  // Signing out everywhere is explained, and no longer dressed as a danger.
  const everywhere = screen.getByRole("button", { name: t.profile.signOutAll });
  expect(within(everywhere).getByText(t.profile.signOutAllHint)).toBeTruthy();
  expect(StyleSheet.flatten(everywhere.props.style).borderColor).not.toBe(color.danger);
});

test("You says when you're paused, before the visibility choice", async () => {
  const { api } = fakeApi({
    "GET /v1/me/profile": () => ({ status: 200, body: { ...PROFILE, discovery_paused: true, visibility: "liked_only" } }),
    "GET /v1/me": () => ({ status: 200, body: ME }),
  });
  await renderWithApp(<ProfileScreen />, api);
  const privacy = await screen.findByRole("button", { name: t.profile.privacy });
  expect(within(privacy).getByText(t.profile.paused)).toBeTruthy();
  expect(within(privacy).queryByText(t.privacy.likedOnly)).toBeNull();
});
