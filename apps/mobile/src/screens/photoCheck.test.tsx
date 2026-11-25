/**
 * TICK-APP-1..2 (stage 29b, D164): the blue tick's screen. A gesture from the server, a selfie from
 * the front camera, then our team; each state says what it means. (The tick on profiles and cards:
 * TICK-APP-3, in the discovery and profile tests.)
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

import { fill, t } from "@/i18n/en";
import { PhotoCheckScreen } from "@/screens/photoCheck";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

jest.mock("expo-image-picker", () => ({
  CameraType: { front: "front", back: "back" },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///selfie.jpg", mimeType: "image/jpeg", fileName: "selfie.jpg" }],
  })),
}));
beforeEach(() => jest.clearAllMocks());

const check = (over: Record<string, unknown> = {}, status = 200) => ({
  status,
  body: { state: "none", gesture: null, expires_at: null, reason: null, verified_at: null, ...over },
});
const AWAITING = { state: "awaiting", gesture: "thumbs_up", expires_at: "2026-11-26T06:15:00Z" };

test("TICK-APP-1: a gesture, a selfie from the front camera, then our team", async () => {
  let current = check();
  const { api, calls } = fakeApi({
    "GET /v1/me/photo-check": () => current,
    "POST /v1/me/photo-check/gesture": () => {
      current = check(AWAITING);
      return check(AWAITING, 201);
    },
    "POST /v1/me/photo-check/selfie": () => {
      current = check({ state: "pending" });
      return check({ state: "pending" }, 201);
    },
  });
  await renderWithApp(<PhotoCheckScreen />, api);
  expect(await screen.findByText(t.photoCheck.intro)).toBeTruthy(); // not an ID check; the selfie is deleted
  await fireEvent.press(screen.getByRole("button", { name: t.photoCheck.start }));
  expect(await screen.findByText(t.photoCheck.gestures.thumbs_up)).toBeTruthy();
  expect(screen.getByText(fill(t.photoCheck.until, { time: "11:45" }))).toBeTruthy(); // 06:15 UTC is 11:45 in India
  expect(screen.queryByRole("button", { name: t.photoCheck.start })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: t.photoCheck.take }));
  expect(await screen.findByText(t.photoCheck.pending)).toBeTruthy();
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ cameraType: "front", exif: false }));
  expect(calls.filter((c) => c.method === "POST" && c.path === "/v1/me/photo-check/selfie")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: t.photoCheck.take })).toBeNull();
  expect(screen.queryByRole("button", { name: t.photoCheck.start })).toBeNull();
});

test("TICK-APP-1b: without the camera, the screen says how to allow it, and nothing is sent", async () => {
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ granted: false } as never);
  const { api, calls } = fakeApi({ "GET /v1/me/photo-check": () => check(AWAITING) });
  await renderWithApp(<PhotoCheckScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.photoCheck.take }));
  expect(await screen.findByText(t.photoCheck.cameraPermission)).toBeTruthy();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(calls.some((c) => c.path === "/v1/me/photo-check/selfie")).toBe(false);
});

test.each([
  ["verified", { state: "verified", verified_at: "2026-11-26T06:20:00Z" }, t.photoCheck.verified, true],
  ["removed", { state: "removed" }, t.photoCheck.removed, false],
  [
    "rejected",
    { state: "rejected", reason: "unclear" },
    fill(t.photoCheck.rejected, { reason: t.photoCheck.reasons.unclear }),
    false,
  ],
] as const)("TICK-APP-2: %s says so, and what comes next", async (_state, over, words, ticked) => {
  const { api } = fakeApi({ "GET /v1/me/photo-check": () => check(over) });
  await renderWithApp(<PhotoCheckScreen />, api);
  expect(await screen.findByText(words)).toBeTruthy();
  expect(screen.queryAllByText(t.tick.label)).toHaveLength(ticked ? 1 : 0);
  expect(screen.queryByRole("button", { name: t.photoCheck.start }) === null).toBe(ticked); // try again unless ticked
});

test("TICK-APP-2b: a refusal says why", async () => {
  const { api } = fakeApi({
    "GET /v1/me/photo-check": () => check(),
    "POST /v1/me/photo-check/gesture": () => problem(409, "photos_required"),
  });
  await renderWithApp(<PhotoCheckScreen />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.photoCheck.start }));
  await waitFor(() => expect(screen.getByText(t.errors.photos_required)).toBeTruthy());
});
