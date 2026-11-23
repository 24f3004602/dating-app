/**
 * LIVE-APP-8..11 (stage 23, D123): the Live screen. The rules come first; what's in the
 * way is said plainly with the way forward (photos, privacy, the plan); Start opens the
 * camera and waits; Stop turns it off; a phone build without WebRTC says where calls work.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type { IceConfig, StreamLike } from "@/calls/peer";
import type { LiveRtc } from "@/calls/session";
import { BRAND } from "@/config";
import { fill, t } from "@/i18n/en";
import { clock, LiveScreen } from "@/screens/live";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => {
  const { useEffect: effect } = jest.requireActual<typeof import("react")>("react");
  return {
    ...require("@/test/expoRouter").expoRouterInPlace(),
    useRouter: () => mockRouter,
    // No navigator in screen tests: the screen is focused while mounted.
    useFocusEffect: (run: () => void | (() => void)) => effect(run, [run]),
  };
});
beforeEach(() => jest.clearAllMocks());

function SignedIn({ children }: { children: React.ReactNode }) {
  const { signIn, status } = useAuth();
  useEffect(() => {
    void signIn("member-token");
  }, [signIn]);
  return <>{status === "signedIn" ? children : null}</>;
}

const live = (over: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    available: true, ready: "ok", rules_version: "2026-11", rules_accepted: true,
    free_calls: 5, free_calls_left: 4, free_call_seconds: 60, plan: false, plan_call_seconds: 600,
    waiting: false, call: null, ...over,
  },
}); // prettier-ignore

function fakeRtc(): LiveRtc & { stopped: string[] } {
  const stopped: string[] = [];
  const stream: StreamLike = { getTracks: () => [{ kind: "video", enabled: true, stop: () => stopped.push("video") }] };
  return {
    stopped,
    openCamera: jest.fn(async () => stream),
    link: jest.fn((_ice: IceConfig) => {
      throw new Error("not in this test");
    }),
  };
}

test("LIVE-APP-8: the rules come first, then Start", async () => {
  let accepted = false;
  const { api, calls } = fakeApi({
    "GET /v1/live": () => live(accepted ? {} : { ready: "rules", rules_accepted: false }),
    "PUT /v1/live/rules": () => {
      accepted = true;
      return live();
    },
  });
  await renderWithApp(<SignedIn><LiveScreen rtc={fakeRtc()} /></SignedIn>, api);
  expect(await screen.findByRole("heading", { name: t.live.rulesTitle })).toBeTruthy();
  for (const rule of t.live.rules) expect(screen.getByText(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.live.start })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: t.live.agree }));
  expect(await screen.findByRole("button", { name: t.live.start })).toBeTruthy();
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ version: "2026-11" });
  expect(screen.getByText(fill(t.live.freeLeft, { n: 4, total: 5 }))).toBeTruthy();
  expect(screen.getByText(t.live.relayNote)).toBeTruthy();
});

test("SAFE-GUIDE-APP-4: Live's lobby leads to the safety guide", async () => {
  const { api } = fakeApi({ "GET /v1/live": () => live() });
  await renderWithApp(<SignedIn><LiveScreen rtc={fakeRtc()} /></SignedIn>, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.safetyGuide.open }));
  expect(mockRouter.push).toHaveBeenCalledWith("/safety/guide");
});

test("LIVE-APP-9: what's in the way, with the way forward", async () => {
  const plan = fill(t.plan.name, { brand: BRAND });
  const { api } = fakeApi({ "GET /v1/live": () => live({ ready: "no_calls_left", free_calls_left: 0 }) });
  await renderWithApp(<SignedIn><LiveScreen rtc={fakeRtc()} /></SignedIn>, api);
  expect(await screen.findByText(fill(t.live.freeNone, { total: 5 }))).toBeTruthy();
  expect(screen.getByText(fill(t.live.problems.live_no_calls_left, { plan }))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.live.start })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: fill(t.live.seePlan, { plan }) }));
  expect(mockRouter.push).toHaveBeenCalledWith("/plan");
});

test.each([
  ["profile_incomplete", t.live.problems.live_profile_incomplete, t.live.toPhotos, "/photos"],
  ["paused", t.live.problems.live_paused, t.live.toPrivacy, "/privacy"],
])("LIVE-APP-9b: %s says so and leads there", async (ready, text, button, path) => {
  const { api } = fakeApi({ "GET /v1/live": () => live({ ready }) });
  await renderWithApp(<SignedIn><LiveScreen rtc={fakeRtc()} /></SignedIn>, api);
  expect(await screen.findByText(text)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: button }));
  expect(mockRouter.push).toHaveBeenCalledWith(path);
});

test("LIVE-APP-10: Start turns the camera on and waits; Stop turns it off and leaves the queue", async () => {
  const rtc = fakeRtc();
  const { api, calls } = fakeApi({
    "GET /v1/live": () => live(),
    "POST /v1/live/queue": () => ({ status: 200, body: { state: "waiting", call: null, retry_after_s: 4 } }),
    "DELETE /v1/live/queue": () => ({ status: 204 }),
  });
  await renderWithApp(<SignedIn><LiveScreen rtc={rtc} /></SignedIn>, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.live.start }));
  expect(await screen.findByText(t.live.searching)).toBeTruthy();
  expect(screen.getByLabelText(t.live.you)).toBeTruthy();
  const joined = calls.find((c) => c.path === "/v1/live/queue" && c.method === "POST");
  expect((joined?.body as { client_id: string }).client_id).toMatch(/^[0-9a-f-]{36}$/);
  await fireEvent.press(screen.getByRole("button", { name: t.live.stop }));
  await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/v1/live/queue")).toBe(true));
  expect(rtc.stopped).toEqual(["video"]);
  expect(await screen.findByRole("button", { name: t.live.start })).toBeTruthy();
});

test("LIVE-APP-11: a phone build without WebRTC says calls work in the web app", async () => {
  const { api } = fakeApi({ "GET /v1/live": () => live() });
  await renderWithApp(<SignedIn><LiveScreen /></SignedIn>, api);
  expect(await screen.findByText(t.live.webOnly)).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.live.start })).toBeNull();
});

test("the time left reads as minutes and seconds, never below zero", () => {
  expect(clock(60_000)).toBe("1:00");
  expect(clock(41_200)).toBe("0:42");
  expect(clock(-5)).toBe("0:00");
});

test("LIVE-APP-15: mute and camera off while waiting; after a free call's minute runs out, the plan is offered", async () => {
  const plan = fill(t.plan.name, { brand: BRAND });
  const link = { state: "new", remote: null, offer: jest.fn(), answer: jest.fn(), accept: jest.fn(), onChange: () => () => undefined, close: jest.fn() };
  const rtc: LiveRtc = { ...fakeRtc(), link: jest.fn(() => link as never) };
  const call = {
    id: "c1", role: "answerer", client_id: "", state: "connecting", peer: { user_id: "u2", display_name: "Rohan", age: 27 },
    limit_s: 60, free: true, offer_sdp: null, answer_sdp: null, connected_at: null, ends_at: null, ended_at: null,
    end_reason: null, server_now: new Date().toISOString(),
  }; // prettier-ignore
  let paired = false;
  const { api } = fakeApi({
    "GET /v1/live": () => live(),
    "POST /v1/live/queue": (req) =>
      paired
        ? { status: 200, body: { state: "paired", call: { ...call, client_id: (req.body as { client_id: string }).client_id }, retry_after_s: 0 } }
        : { status: 200, body: { state: "waiting", call: null, retry_after_s: 4 } },
    "POST /v1/calls/c1/ice": () => ({ status: 200, body: { policy: "all", servers: [], ttl_s: 150 } }),
    "GET /v1/calls/c1": () => ({
      status: 200,
      body: { ...call, state: "ended", end_reason: "limit", connected_at: call.server_now, ended_at: call.server_now },
    }),
  });
  await renderWithApp(<SignedIn><LiveScreen rtc={rtc} /></SignedIn>, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.live.start }));
  expect(await screen.findByText(t.live.searching)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.live.mute }));
  expect(screen.getByRole("button", { name: t.live.unmute })).toBeTruthy();
  expect(screen.getByText(t.live.yourMicOff)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.live.cameraOff }));
  expect(screen.getByText(t.live.yourCameraOff)).toBeTruthy();

  paired = true;
  await fireEvent.press(screen.getByRole("button", { name: t.live.stop }));
  await fireEvent.press(await screen.findByRole("button", { name: t.live.start }));
  expect(await screen.findByText(fill(t.live.longer, { plan, minutes: 10 }))).toBeTruthy();
  expect(screen.getByText(new RegExp(t.live.timeUp))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: fill(t.live.seePlan, { plan }) }));
  expect(mockRouter.push).toHaveBeenCalledWith("/plan");
});
