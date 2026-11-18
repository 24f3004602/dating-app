/**
 * LIVE-APP-12..14 (stage 23, D094, D123): the plan. The price is the provider's; paying
 * opens the provider's page (web and direct-download builds only); stopping renewal asks
 * first and keeps what was paid for; nothing is sold where payments aren't set up.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { Linking } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { BRAND } from "@/config";
import { fill, t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { money, PlanScreen, priceLine } from "@/screens/plan";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

jest.mock("expo-router", () => ({ ...require("@/test/expoRouter").expoRouterInPlace(), useRouter: () => ({ push: jest.fn() }) }));

function SignedIn({ children }: { children: React.ReactNode }) {
  const { signIn, status } = useAuth();
  useEffect(() => {
    void signIn("member-token");
  }, [signIn]);
  return <>{status === "signedIn" ? children : null}</>;
}

const NAME = fill(t.plan.name, { brand: BRAND });
const PRICE = { status: 200, body: { available: true, amount: 29900, currency: "INR", period: "monthly", interval: 1 } };
const NONE = { status: 200, body: { status: "none", entitled: false, paid_until: null, renews: false } };
const LIVE = {
  status: 200,
  body: {
    available: true, ready: "no_calls_left", rules_version: "2026-11", rules_accepted: true, free_calls: 5,
    free_calls_left: 0, free_call_seconds: 60, plan: false, plan_call_seconds: 600, waiting: false, call: null,
  },
}; // prettier-ignore

beforeEach(() => {
  jest.clearAllMocks(); // the preset's Linking is already a mock: clear its calls between tests
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("prices read as people say them", () => {
  expect(money(29900, "INR")).toBe("₹299");
  expect(money(29950, "INR")).toBe("₹299.50");
  expect(priceLine(PRICE.body as never)).toBe("₹299 a month");
  expect(priceLine({ ...PRICE.body, amount: 79900, interval: 3 } as never)).toBe("₹799 every 3 months");
});

test("LIVE-APP-12: the provider's price, what it brings, and paying on the provider's page", async () => {
  let sub = NONE;
  const { api, calls } = fakeApi({
    "GET /v1/plan": () => PRICE,
    "GET /v1/live": () => LIVE,
    "GET /v1/me/subscription": () => sub,
    "POST /v1/me/subscription": () => ({
      status: 201,
      body: { subscription_id: "sub_1", key_id: "rzp_test_x", checkout_url: "https://rzp.io/i/abc" },
    }),
  });
  await renderWithApp(<SignedIn><PlanScreen canPay /></SignedIn>, api);
  expect(await screen.findByRole("heading", { name: NAME })).toBeTruthy();
  expect(screen.getByText("₹299 a month")).toBeTruthy();
  expect(screen.getByText(`2. ${fill(t.plan.perks[1] ?? "", { minutes: 10 })}`)).toBeTruthy();
  expect(screen.getByText(t.plan.fairness)).toBeTruthy();
  expect(screen.getByText(fill(t.plan.renews, { period: "month" }))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: fill(t.plan.subscribe, { plan: NAME }) }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith("https://rzp.io/i/abc"));
  expect(await screen.findByText(t.plan.waiting)).toBeTruthy();
  // Back from paying: the webhook has made it active.
  sub = { status: 200, body: { status: "active", entitled: true, paid_until: "2026-12-18T09:00:00Z", renews: true } } as never;
  await fireEvent.press(screen.getByRole("button", { name: t.plan.refresh }));
  expect(await screen.findByText(/You have .* until/)).toBeTruthy();
  expect(calls.filter((c) => c.method === "POST" && c.path === "/v1/me/subscription")).toHaveLength(1);
});

test("LIVE-APP-13: stopping renewal asks first and keeps what was paid for", async () => {
  const active = { status: 200, body: { status: "active", entitled: true, paid_until: "2026-12-18T09:00:00Z", renews: true } };
  const { api, calls } = fakeApi({
    "GET /v1/plan": () => PRICE,
    "GET /v1/live": () => LIVE,
    "GET /v1/me/subscription": () => active,
    "POST /v1/me/subscription/cancel": () => ({ status: 200, body: { ...active.body, renews: false } }),
  });
  await renderWithApp(<SignedIn><PlanScreen canPay /></SignedIn>, api);
  const until = dateInIndia("2026-12-18T09:00:00Z");
  expect(await screen.findByText(`${fill(t.plan.active, { plan: NAME, date: until })} ${t.plan.renewing}`)).toBeTruthy();
  expect(screen.queryByRole("button", { name: fill(t.plan.subscribe, { plan: NAME }) })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: t.plan.cancel }));
  expect(screen.getByText(fill(t.plan.cancelAsk, { plan: NAME, date: until }))).toBeTruthy();
  expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(false); // asked first
  await fireEvent.press(screen.getByRole("button", { name: t.plan.cancel }));
  expect(await screen.findByText(fill(t.plan.cancelled, { plan: NAME }))).toBeTruthy();
  expect(screen.getByText(`${fill(t.plan.active, { plan: NAME, date: until })} ${t.plan.notRenewing}`)).toBeTruthy();
});

test("LIVE-APP-14: nothing is sold where payments aren't set up, or in a store build", async () => {
  const off = fakeApi({
    "GET /v1/plan": () => ({ status: 200, body: { available: false, amount: null, currency: null, period: null, interval: null } }),
    "GET /v1/live": () => LIVE,
    "GET /v1/me/subscription": () => NONE,
  });
  const first = await renderWithApp(<SignedIn><PlanScreen canPay /></SignedIn>, off.api);
  expect(await screen.findByText(fill(t.plan.unavailable, { plan: NAME }))).toBeTruthy();
  expect(screen.queryByRole("button", { name: fill(t.plan.subscribe, { plan: NAME }) })).toBeNull();
  await first.unmount();

  const store = fakeApi({ "GET /v1/plan": () => PRICE, "GET /v1/live": () => LIVE, "GET /v1/me/subscription": () => NONE });
  await renderWithApp(<SignedIn><PlanScreen canPay={false} /></SignedIn>, store.api);
  expect(await screen.findByText(fill(t.plan.notHere, { plan: NAME }))).toBeTruthy();
  expect(screen.queryByRole("button", { name: fill(t.plan.subscribe, { plan: NAME }) })).toBeNull();
  expect((Linking.openURL as jest.Mock).mock.calls).toEqual([]);
});
