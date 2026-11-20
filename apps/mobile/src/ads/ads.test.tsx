/**
 * In-app ads (D137): ADS-APP-1..7. The ads provider and the banner over the real API client and
 * a fake server, with Google's SDK a stand-in (src/test/googleMobileAds.ts) and this file's build
 * set to Android with test ads. expo-router's path is a small store, so moving between places is
 * a route change, as in the app.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import * as googleAds from "react-native-google-mobile-ads";

import { AdBanner } from "@/ads/AdBanner";
import { AdsProvider } from "@/ads/AdsProvider";
import { FULL_SCREEN, fullScreenDue, TEST_UNITS } from "@/ads/config";
import { useDecide } from "@/api/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { BRAND } from "@/config";
import { fill, t } from "@/i18n/en";
import { PlanScreen } from "@/screens/plan";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";
import { TourProvider } from "@/tour/TourProvider";
import { TourStage } from "@/tour/TourStage";

jest.mock("@/ads/config", () => ({ ...jest.requireActual("@/ads/config"), ADS_MODE: "test", ADS_IN_BUILD: true }));

const mockNav = { path: "/discover", listeners: new Set<() => void>() };
function mockGo(path: string) {
  mockNav.path = path;
  for (const notify of mockNav.listeners) notify();
}
jest.mock("expo-router", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (notify: () => void) => {
    mockNav.listeners.add(notify);
    return () => void mockNav.listeners.delete(notify);
  };
  const path = () => mockNav.path;
  return {
    ...require("@/test/expoRouter").expoRouterInPlace(),
    useRouter: () => ({ navigate: mockGo, push: mockGo, replace: mockGo, back: jest.fn() }),
    usePathname: () => useSyncExternalStore(subscribe, path, path),
  };
});

type Fakes = {
  sdk: { initialize: jest.Mock; setRequestConfiguration: jest.Mock };
  InterstitialAd: { created: { adUnitId: string; requestOptions: unknown; loaded: boolean; show: jest.Mock; close: () => void }[] };
};
const fakes = googleAds as unknown as Fakes;
/** The full-screen ad the app keeps loaded (the first one made). */
function firstAd() {
  const ad = fakes.InterstitialAd.created[0];
  if (!ad) throw new Error("no full-screen ad was made");
  return ad;
}

const DAY = 24 * 60 * 60_000;
const me = (joinedDaysAgo: number) => ({
  id: "00000000-0000-4000-8000-000000000002", email: "meera@example.com", age: 27, birthdate: "1999-01-01",
  created_at: new Date(Date.now() - joinedDaysAgo * DAY).toISOString(), has_password: true, role: "member",
  verification: { age: "declared", email: "verified", identity: "not_checked" },
});  // prettier-ignore
const FREE = { status: "none", entitled: false, paid_until: null, renews: false };
const PLUS = { status: "active", entitled: true, paid_until: "2026-12-20T00:00:00Z", renews: false };

function server({ joinedDaysAgo = 40, plan = FREE as object | null } = {}) {
  return fakeApi({
    "GET /v1/me": () => ({ status: 200, body: me(joinedDaysAgo) }),
    "GET /v1/me/subscription": () => (plan ? { status: 200, body: plan } : problem(500, "internal")),
    "GET /v1/me/profile": () => problem(404, "profile_not_found"),
    "GET /v1/live": () => problem(503, "live_unavailable"),
    "POST /v1/interactions": (req) => {
      const body = req.body as { target_id: string; kind: string };
      return { status: 201, body: { kind: body.kind, match: body.target_id === "match-me" ? { id: "m1" } : null, likes_left_today: 9 } };
    },
  });
}

/** Decides about someone the way a profile does (the app's own hook). */
function Decide() {
  const decide = useDecide();
  return (
    <>
      <Pressable role="button" aria-label="pass" onPress={() => decide.mutate({ target_id: "someone", kind: "pass" })} />
      <Pressable role="button" aria-label="like a match" onPress={() => decide.mutate({ target_id: "match-me", kind: "like" })} />
      <Text>{decide.isSuccess ? "decided" : "deciding"}</Text>
    </>
  );
}

async function renderAds(api: ReturnType<typeof server>["api"]) {
  return renderWithApp(
    <TourProvider>
      <AdsProvider>
        <TourStage>
          <Decide />
        </TourStage>
        <AdBanner />
      </AdsProvider>
    </TourProvider>,
    api,
  );
}

const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

async function decide(times: number, name = "pass") {
  for (let i = 0; i < times; i++) {
    await fireEvent.press(screen.getByRole("button", { name }));
    await settle();
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  fakes.InterstitialAd.created.length = 0;
  mockNav.path = "/discover";
  // What the device remembers (the tour's answer, when full-screen ads were shown) starts empty.
  for (const key of ["tour.offered.v1", "tour.voice", "ads.fullscreen"]) await SecureStore.deleteItemAsync(key);
});

test("a member without Plus: the SDK starts, non-personalised and rated for teens, and Today has the banner, labelled (ADS-APP-1)", async () => {
  const { api } = server();
  await renderAds(api);
  const banner = await screen.findByTestId("google-banner");
  expect(banner.props.banner).toMatchObject({
    unitId: TEST_UNITS.banner,
    size: "ANCHORED_ADAPTIVE_BANNER",
    requestOptions: { requestNonPersonalizedAdsOnly: true },
  });
  expect(screen.getByLabelText(t.ads.spoken)).toBeTruthy();
  expect(screen.getByText(t.ads.label)).toBeTruthy();
  expect(fakes.sdk.setRequestConfiguration).toHaveBeenCalledWith({
    maxAdContentRating: "T",
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });
  expect(fakes.sdk.initialize).toHaveBeenCalledTimes(1);
  // One full-screen ad waits, loaded, non-personalised too.
  expect(fakes.InterstitialAd.created).toHaveLength(1);
  expect(fakes.InterstitialAd.created[0]).toMatchObject({ adUnitId: TEST_UNITS.interstitial, requestOptions: { requestNonPersonalizedAdsOnly: true }, loaded: true });
});

test("the banner is only on the lists: Today, Likes, Matches; never Live, You, a chat, a profile, Safety or Plus (ADS-APP-2)", async () => {
  const { api } = server();
  await renderAds(api);
  await screen.findByTestId("google-banner");
  for (const path of ["/likes", "/matches", "/discover"]) {
    await act(async () => mockGo(path));
    expect(screen.getByTestId("google-banner")).toBeTruthy();
  }
  for (const path of ["/live", "/profile", "/chat/m1", "/person/p1", "/safety", "/report/p1", "/plan", "/privacy"]) {
    await act(async () => mockGo(path));
    expect(screen.queryByTestId("google-banner")).toBeNull();
  }
});

test("Plus: no banner, no full-screen ad, and the SDK never starts; nor while the plan can't be read (ADS-APP-3)", async () => {
  for (const plan of [PLUS, null]) {
    jest.clearAllMocks();
    fakes.InterstitialAd.created.length = 0;
    const { api, calls } = server({ plan });
    const view = await renderAds(api);
    await waitFor(() => expect(calls.some((c) => c.path === "/v1/me/subscription")).toBe(true));
    await settle();
    expect(screen.queryByTestId("google-banner")).toBeNull();
    expect(fakes.sdk.initialize).not.toHaveBeenCalled();
    expect(fakes.sdk.setRequestConfiguration).not.toHaveBeenCalled();
    expect(fakes.InterstitialAd.created).toHaveLength(0);
    await view.unmount();
  }
});

test("the tour pauses ads: no banner while its card is up (ADS-APP-4)", async () => {
  const { api } = server({ joinedDaysAgo: 2 }); // new: offered the tour
  await renderAds(api);
  await screen.findByLabelText(t.tour.label);
  await settle();
  expect(fakes.sdk.initialize).toHaveBeenCalled();
  expect(screen.queryByTestId("google-banner")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: t.tour.later }));
  expect(await screen.findByTestId("google-banner")).toBeTruthy();
});

test("full-screen ads only at a natural break: back on Today after enough decisions, never after a match (ADS-APP-5)", async () => {
  const { api } = server({ joinedDaysAgo: 40 });
  await renderAds(api);
  await screen.findByTestId("google-banner");
  const ad = firstAd;
  const breakOnToday = async () => {
    await act(async () => mockGo("/person/p1"));
    await act(async () => mockGo("/discover"));
  };

  // Too few decisions: nothing.
  await decide(FULL_SCREEN.everyDecisions - 1);
  await breakOnToday();
  expect(ad().show).not.toHaveBeenCalled();
  // The fourth decision, then back on Today: shown once.
  await decide(1);
  await act(async () => mockGo("/person/p2"));
  expect(ad().show).not.toHaveBeenCalled(); // not on the way to a profile
  await act(async () => mockGo("/discover"));
  expect(ad().show).toHaveBeenCalledTimes(1);
  // Closed: the next one loads.
  await act(async () => ad().close());
  expect(ad().loaded).toBe(true);
  // Straight after: too soon, whatever the count.
  await decide(FULL_SCREEN.everyDecisions);
  await breakOnToday();
  expect(ad().show).toHaveBeenCalledTimes(1);
  // Coming back from Likes or a chat isn't a break.
  await act(async () => mockGo("/likes"));
  await act(async () => mockGo("/discover"));
  expect(ad().show).toHaveBeenCalledTimes(1);
});

test("never straight after a match, nor in someone's first day (ADS-APP-5)", async () => {
  for (const [joinedDaysAgo, last] of [[40, "like a match"], [0.5, "pass"]] as const) {
    jest.clearAllMocks();
    fakes.InterstitialAd.created.length = 0;
    for (const key of ["tour.offered.v1", "ads.fullscreen"]) await SecureStore.deleteItemAsync(key);
    const { api } = server({ joinedDaysAgo });
    const view = await renderAds(api);
    if (joinedDaysAgo < 1) {
      await screen.findByLabelText(t.tour.label);
      await fireEvent.press(screen.getByRole("button", { name: t.tour.later }));
    }
    await screen.findByTestId("google-banner");
    await decide(FULL_SCREEN.everyDecisions - 1);
    await decide(1, last);
    await act(async () => mockGo("/person/p1"));
    await act(async () => mockGo("/discover"));
    expect(firstAd().show).not.toHaveBeenCalled();
    await view.unmount();
    mockNav.path = "/discover";
  }
});

test("the rules for a break, at their edges (ADS-APP-6)", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const base = { decisions: FULL_SCREEN.everyDecisions, lastWasMatch: false, shown: [] as number[], joined: now - 2 * DAY, now };
  expect(fullScreenDue(base)).toBe(true);
  expect(fullScreenDue({ ...base, decisions: FULL_SCREEN.everyDecisions - 1 })).toBe(false);
  expect(fullScreenDue({ ...base, lastWasMatch: true })).toBe(false);
  expect(fullScreenDue({ ...base, joined: now - FULL_SCREEN.notInFirstMs + 1 })).toBe(false);
  expect(fullScreenDue({ ...base, joined: now - FULL_SCREEN.notInFirstMs })).toBe(true);
  expect(fullScreenDue({ ...base, joined: Number.NaN })).toBe(false);
  expect(fullScreenDue({ ...base, shown: [now - FULL_SCREEN.minGapMs + 1] })).toBe(false);
  expect(fullScreenDue({ ...base, shown: [now - FULL_SCREEN.minGapMs] })).toBe(true);
  const today = Array.from({ length: FULL_SCREEN.maxPerDay }, (_, i) => now - (i + 1) * FULL_SCREEN.minGapMs * 3);
  expect(fullScreenDue({ ...base, shown: today.slice().reverse() })).toBe(false);
  // Those a day old no longer count.
  expect(fullScreenDue({ ...base, shown: [now - DAY - 1, ...today.slice(1).reverse()] })).toBe(true);
});

function SignedIn({ children }: { children: React.ReactNode }) {
  const { signIn, status } = useAuth();
  useEffect(() => {
    void signIn("member-token");
  }, [signIn]);
  return <>{status === "signedIn" ? children : null}</>;
}

test("Plus lists no ads among what it brings, in a build that has ads (ADS-APP-7)", async () => {
  const { api } = fakeApi({
    "GET /v1/plan": () => ({ status: 200, body: { available: true, amount: 29900, currency: "INR", period: "monthly", interval: 1 } }),
    "GET /v1/live": () => problem(503, "live_unavailable"),
    "GET /v1/me/subscription": () => ({ status: 200, body: FREE }),
  });
  await renderWithApp(<SignedIn><PlanScreen canPay /></SignedIn>, api);
  expect(await screen.findByRole("heading", { name: fill(t.plan.name, { brand: BRAND }) })).toBeTruthy();
  expect(screen.getByText(`${t.plan.perks.length + 1}. ${t.plan.noAds}`)).toBeTruthy();
});
