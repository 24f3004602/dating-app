/**
 * The app tour (D136): TOUR-APP-1..10. The provider and its card around a stand-in for the
 * places (which shows the route behind the card), over the real API client and a fake server;
 * expo-router's router and path are a small store, so a "tap on a stop" is a route change.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { usePathname } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { AccessibilityInfo, Text } from "react-native";

import { BRAND } from "@/config";
import { ProfileScreen } from "@/screens/profile";
import { fill, t } from "@/i18n/en";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";
import { isNewAccount, NEW_FOR_DAYS, spoken, tourStops } from "@/tour/stops";
import { TourProvider } from "@/tour/TourProvider";
import { TourStage } from "@/tour/TourStage";
import { pickVoice, resetVoice, sentences, SPEECH_LANGUAGE } from "@/tour/voice";

const mockNav = { path: "/profile", listeners: new Set<() => void>() };
function mockGo(path: string) {
  mockNav.path = path;
  for (const notify of mockNav.listeners) notify();
}
const mockRouter = { navigate: jest.fn((path: string) => mockGo(path)), push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (notify: () => void) => {
    mockNav.listeners.add(notify);
    return () => void mockNav.listeners.delete(notify);
  };
  const path = () => mockNav.path;
  return { useRouter: () => mockRouter, usePathname: () => useSyncExternalStore(subscribe, path, path) };
});

const DAY = 24 * 60 * 60 * 1000;
const PLAN = fill(t.plan.name, { brand: BRAND });
const me = (joinedDaysAgo: number) => ({
  id: "00000000-0000-4000-8000-000000000001", email: "asha@example.com", age: 27, birthdate: "1999-01-01",
  created_at: new Date(Date.now() - joinedDaysAgo * DAY).toISOString(), has_password: true, role: "member",
  verification: { age: "declared", email: "verified", identity: "not_checked" },
});  // prettier-ignore
const LIVE = {
  available: true, call: null, free_call_seconds: 60, free_calls: 5, free_calls_left: 5, plan: false,
  plan_call_seconds: 600, ready: "rules", rules_accepted: false, rules_version: "live-1", waiting: false,
  lgbtq_labels: false, lgbtq_only: false,
};  // prettier-ignore

function server({ joinedDaysAgo = 0, live = LIVE as object | null } = {}) {
  return fakeApi({
    "GET /v1/me": () => ({ status: 200, body: me(joinedDaysAgo) }),
    "GET /v1/live": () => (live ? { status: 200, body: live } : problem(503, "live_unavailable")),
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
  });
}

/** Stands in for the tab slot: which place is behind the card. */
function Places() {
  return <Text>{`place ${usePathname()}`}</Text>;
}

async function renderTour(api: ReturnType<typeof server>["api"]) {
  return renderWithApp(
    <TourProvider>
      <TourStage>
        <Places />
      </TourStage>
    </TourProvider>,
    api,
  );
}

const said = () => (Speech.speak as jest.Mock).mock.calls.map((call) => call[0] as string);
const stopsNow = () => tourStops({ live: LIVE as never, hasProfile: false });
const stop = (key: string) => stopsNow().find((s) => s.key === key)!;
/** Lets the provider read the device's memory after the account arrives. */
const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(async () => {
  jest.clearAllMocks();
  resetVoice();
  mockNav.path = "/profile";
  await SecureStore.deleteItemAsync("tour.offered.v1");
  await SecureStore.deleteItemAsync("tour.voice");
  (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([]);
  (Speech.speak as jest.Mock).mockImplementation(() => undefined);
});

test("offered once to someone new: Not now is remembered on the device (TOUR-APP-1)", async () => {
  const { api, calls } = server({ joinedDaysAgo: 0 });
  const first = await renderTour(api);
  const dialog = await screen.findByLabelText(t.tour.label);
  expect(dialog.props.role).toBe("dialog");
  expect(within(dialog).getByRole("heading", { name: fill(t.tour.offerTitle, { brand: BRAND }) })).toBeTruthy();
  expect(within(dialog).getByText(t.tour.offerBody)).toBeTruthy();
  // Offered, never started unasked: nothing is said until the member chooses.
  expect(Speech.speak).not.toHaveBeenCalled();
  await fireEvent.press(within(dialog).getByRole("button", { name: t.tour.later }));
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
  expect(await SecureStore.getItemAsync("tour.offered.v1")).toBe("yes");

  await first.unmount();
  await renderTour(api);
  await waitFor(() => expect(calls.filter((c) => c.path === "/v1/me")).toHaveLength(2));
  await settle();
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
});

test(`not offered unasked to an account over ${NEW_FOR_DAYS} days old (TOUR-APP-2)`, async () => {
  const { api, calls } = server({ joinedDaysAgo: NEW_FOR_DAYS + 1 });
  await renderTour(api);
  await waitFor(() => expect(calls.some((c) => c.path === "/v1/me")).toBe(true));
  await settle();
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
  const now = Date.parse("2026-11-20T00:00:00Z");
  expect(isNewAccount(new Date(now - NEW_FOR_DAYS * DAY).toISOString(), now)).toBe(true);
  expect(isNewAccount(new Date(now - NEW_FOR_DAYS * DAY - 1).toISOString(), now)).toBe(false);
  expect(isNewAccount("not a date", now)).toBe(false);
});

test("the tour walks the line: each stop opens its place behind the card and is read aloud (TOUR-APP-3)", async () => {
  const { api } = server();
  await renderTour(api);
  await fireEvent.press(await screen.findByRole("button", { name: t.tour.start }));
  expect(await SecureStore.getItemAsync("tour.offered.v1")).toBe("yes");

  // Today: the place opens behind the card, the words are on a plate, and the voice says them, a sentence at a time.
  expect(mockRouter.navigate).toHaveBeenLastCalledWith("/discover");
  expect(screen.getByText("place /discover", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: t.tour.stops.today.title })).toBeTruthy();
  expect(screen.getByText(fill(t.tour.progress, { n: 1, total: 7 }))).toBeTruthy();
  expect(screen.getByText(t.tour.tapStops)).toBeTruthy();
  await waitFor(() => expect(said()).toEqual(sentences(spoken(stop("today")))));
  expect((Speech.speak as jest.Mock).mock.calls[0][1]).toMatchObject({ language: SPEECH_LANGUAGE });
  expect(SPEECH_LANGUAGE).toBe("en-IN"); // Jest runs as iOS; Android's is "en" with an Indian voice (TOUR-APP-9)
  expect(screen.getByRole("button", { name: t.tour.back, disabled: true })).toBeTruthy();

  const walk: [string, string][] = [["likes", "/likes"], ["live", "/live"], ["matches", "/matches"], ["you", "/profile"], ["safety", "/profile"]];
  for (const [i, [key, path]] of walk.entries()) {
    (Speech.speak as jest.Mock).mockClear();
    await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));
    const now = stop(key);
    expect(screen.getByRole("heading", { name: now.title })).toBeTruthy();
    expect(screen.getByText(now.body)).toBeTruthy();
    expect(screen.getByText(fill(t.tour.progress, { n: i + 2, total: 7 }))).toBeTruthy();
    expect(screen.getByText(`place ${path}`, { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(said()).toEqual(sentences(spoken(now))));
  }
  // Each place opened once, in the line's order; the last three stops are all under You.
  expect(mockRouter.navigate.mock.calls.map((c) => c[0])).toEqual(["/discover", "/likes", "/live", "/matches", "/profile"]);
  // Live's allowance is the server's own numbers, and Plus is named, not priced.
  expect(stop("live").body).toContain(fill(t.tour.liveFree, { n: 5, length: t.tour.aMinute, plan: PLAN }));
  expect(stop("live").body).not.toMatch(/₹|Rs/);

  // Back goes the other way.
  await fireEvent.press(screen.getByRole("button", { name: t.tour.back }));
  expect(screen.getByRole("heading", { name: t.tour.stops.you.title })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));
  await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));

  // The last stop: no profile yet, so it starts there, and Done closes the tour, quietly.
  expect(screen.getByRole("heading", { name: t.tour.stops.finish.title })).toBeTruthy();
  expect(screen.getByText(`${t.tour.startProfile} ${t.tour.stops.finish.body}`)).toBeTruthy();
  expect(screen.getByRole("button", { name: t.tour.createProfile })).toBeTruthy();
  (Speech.stop as jest.Mock).mockClear();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.done }));
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
  expect(Speech.stop).toHaveBeenCalled();
  expect(screen.getByText("place /profile")).toBeTruthy(); // back in reach once the card has gone
});

test("a tap on a stop takes the tour there; Create your profile closes it and opens the form (TOUR-APP-4)", async () => {
  const { api } = server();
  await renderTour(api);
  await fireEvent.press(await screen.findByRole("button", { name: t.tour.start }));
  (Speech.speak as jest.Mock).mockClear();
  mockRouter.navigate.mockClear();
  // The member taps Matches on the line bar (the bar's own trigger changes the route).
  await act(async () => mockGo("/matches"));
  expect(screen.getByRole("heading", { name: t.tour.stops.matches.title })).toBeTruthy();
  expect(screen.getByText(fill(t.tour.progress, { n: 4, total: 7 }))).toBeTruthy();
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  await waitFor(() => expect(said()).toEqual(sentences(spoken(stop("matches")))));
  // And You: its first stop.
  await act(async () => mockGo("/profile"));
  expect(screen.getByRole("heading", { name: t.tour.stops.you.title })).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));
  await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));
  await fireEvent.press(screen.getByRole("button", { name: t.tour.createProfile }));
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
  expect(mockRouter.push).toHaveBeenCalledWith("/profile/edit");
});

test("reading aloud: off is remembered and keeps the tour quiet; on again, and Listen again, say the stop (TOUR-APP-5)", async () => {
  const { api } = server();
  const first = await renderTour(api);
  await screen.findByLabelText(t.tour.label);
  await fireEvent(screen.getByRole("switch", { name: t.tour.readAloud, checked: true }), "valueChange", false);
  expect(await SecureStore.getItemAsync("tour.voice")).toBe("off");
  await fireEvent.press(screen.getByRole("button", { name: t.tour.start }));
  await fireEvent.press(screen.getByRole("button", { name: t.tour.next }));
  await settle();
  expect(Speech.speak).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: t.tour.listen })).toBeNull();

  await fireEvent(screen.getByRole("switch", { name: t.tour.readAloud, checked: false }), "valueChange", true);
  expect(await SecureStore.getItemAsync("tour.voice")).toBe("on");
  await waitFor(() => expect(said()).toEqual(sentences(spoken(stop("likes")))));
  (Speech.speak as jest.Mock).mockClear();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.listen }));
  await waitFor(() => expect(said()).toEqual(sentences(spoken(stop("likes")))));

  // Turned off on a stop: quiet at once. Closing the tour quietens it too.
  (Speech.stop as jest.Mock).mockClear();
  await fireEvent(screen.getByRole("switch", { name: t.tour.readAloud, checked: true }), "valueChange", false);
  expect(Speech.stop).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.close }));
  expect(screen.queryByLabelText(t.tour.label)).toBeNull();
  await first.unmount();
});

test("a phone's screen reader: the tour starts without the voice, and the card's name gets the focus (TOUR-APP-6)", async () => {
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValueOnce(true);
  const { api } = server();
  await renderTour(api);
  await screen.findByLabelText(t.tour.label);
  await waitFor(() => expect(screen.getByRole("switch", { name: t.tour.readAloud, checked: false })).toBeTruthy());
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), "focus");
  await fireEvent.press(screen.getByRole("button", { name: t.tour.start }));
  await settle();
  expect(Speech.speak).not.toHaveBeenCalled();
});

test("while the card is up, the place behind it is out of reach of screen readers; the line bar isn't covered (TOUR-APP-7)", async () => {
  const { api } = server();
  await renderTour(api);
  await screen.findByLabelText(t.tour.label);
  expect(screen.queryByText("place /profile")).toBeNull();
  expect(screen.getByText("place /profile", { includeHiddenElements: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.later }));
  expect(screen.getByText("place /profile")).toBeTruthy();
});

test("a voice that fails: the tour tries the engine's own English once, then turns reading aloud off and says so (TOUR-APP-8)", async () => {
  (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([
    { identifier: "en-us-x-sfg-network", language: "en-US", quality: "Default", name: "en-us-x-sfg-network" },
    { identifier: "en-in-x-ena-local", language: "en-IN", quality: "Enhanced", name: "en-in-x-ena-local" },
  ]);
  const attempts: (string | undefined)[] = [];
  (Speech.speak as jest.Mock).mockImplementation((_text: string, options: Speech.SpeechOptions) => {
    attempts.push(options.voice);
    options.onError?.(new Error("synthesis failed"));
  });
  const { api } = server();
  await renderTour(api);
  await screen.findByLabelText(t.tour.label);
  await settle(); // the voices are looked through while the offer is read
  await fireEvent.press(screen.getByRole("button", { name: t.tour.start }));
  await waitFor(() => expect(screen.getByText(t.tour.voiceFailed)).toBeTruthy());
  // First with the Indian English voice on the device, then once with the engine's own; then no more.
  expect(attempts).toStrictEqual(["en-in-x-ena-local", undefined]); // strict: toEqual can't tell [a] from [a, undefined]
  expect(screen.getByRole("switch", { name: t.tour.readAloud, checked: false })).toBeTruthy();
  // Not remembered as a choice: the member never turned it off.
  expect(await SecureStore.getItemAsync("tour.voice")).toBeNull();
  // The words are all still there.
  expect(screen.getByText(t.tour.stops.today.body)).toBeTruthy();
});

test("the voice: Indian English on the device first; sentences one at a time; Live's numbers from the server (TOUR-APP-9)", () => {
  const voice = (identifier: string, language: string, extra: object = {}) => ({ identifier, language, quality: "Default", ...extra });
  expect(pickVoice([voice("hi-in-x-hia-local", "hi-IN"), voice("en-us-x-iom-local", "en-US"), voice("en-in-x-ahp-network", "en-IN"), voice("en-in-x-ena-local", "en-IN")])).toBe("en-in-x-ena-local");
  // The web's list: underscores, and localService instead of a name.
  expect(pickVoice([voice("Google English (India)", "en_IN", { localService: false }), voice("Microsoft Heera", "en-IN", { localService: true })])).toBe("Microsoft Heera");
  expect(pickVoice([voice("Google US English", "en-US", { localService: false }), voice("Daniel", "en-GB", { localService: true })])).toBe("Daniel");
  expect(pickVoice([voice("hi-in-x-hid-local", "hi-IN"), voice("x", "eng-XX")])).toBeUndefined();
  expect(pickVoice([])).toBeUndefined();

  expect(sentences("Today. Open a profile to like or pass. It's a match!  Done?")).toEqual(["Today.", "Open a profile to like or pass.", "It's a match!", "Done?"]);
  expect(sentences("Version 1.5 works")).toEqual(["Version 1.5 works"]); // a point inside a number isn't an end

  const live = (free_calls: number, free_call_seconds: number, available = true) => ({ ...LIVE, free_calls, free_call_seconds, available }) as never;
  const body = (l: never | null) => tourStops({ live: l }).find((s) => s.key === "live")!.body;
  expect(body(live(3, 120))).toContain(fill(t.tour.liveFree, { n: 3, length: fill(t.tour.minutes, { n: 2 }), plan: PLAN }));
  expect(body(live(5, 60, false))).toBe(t.tour.stops.live.body); // Live off: no allowance
  expect(body(null)).toBe(t.tour.stops.live.body);
  // With a profile, the last stop doesn't ask for one.
  expect(tourStops({ hasProfile: true }).at(-1)!.body).toBe(t.tour.stops.finish.body);
  // Text and voice never differ: what's said is the title, then the card's words.
  for (const s of tourStops({ live: LIVE as never })) expect(spoken(s)).toBe(`${s.title}. ${s.body}`);
});

test("You has the tour any time: App tour starts it at Today (TOUR-APP-10)", async () => {
  const { api } = fakeApi({
    "GET /v1/me": () => ({ status: 200, body: me(NEW_FOR_DAYS + 5) }), // not offered unasked
    "GET /v1/live": () => ({ status: 200, body: LIVE }),
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
  });
  await renderWithApp(
    <TourProvider>
      <TourStage>
        <ProfileScreen />
      </TourStage>
    </TourProvider>,
    api,
  );
  await fireEvent.press(await screen.findByRole("button", { name: t.tour.replay }));
  expect(await screen.findByRole("heading", { name: t.tour.stops.today.title })).toBeTruthy();
  expect(mockRouter.navigate).toHaveBeenCalledWith("/discover");
  await waitFor(() => expect(said()).toEqual(sentences(spoken(stop("today")))));
});
