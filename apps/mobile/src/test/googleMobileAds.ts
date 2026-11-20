/**
 * react-native-google-mobile-ads for Jest (D137): no native module, so the SDK, the banner and
 * full-screen ads are stand-ins that record what the app asked for. jest.setup.ts installs it;
 * tests read `sdk` and `interstitials` from the mocked module.
 */
import { createElement } from "react";
import { View } from "react-native";

type Listener = (payload?: unknown) => void;

export function fakeGoogleMobileAds() {
  const sdk = {
    initialize: jest.fn(async () => []),
    setRequestConfiguration: jest.fn(async (_config: Record<string, unknown>) => undefined),
  };

  class FakeInterstitial {
    static created: FakeInterstitial[] = [];
    loaded = false;
    private listeners = new Map<string, Set<Listener>>();
    constructor(
      readonly adUnitId: string,
      readonly requestOptions: Record<string, unknown> | undefined,
    ) {}
    static createForAdRequest = jest.fn((unitId: string, options?: Record<string, unknown>) => {
      const ad = new FakeInterstitial(unitId, options);
      FakeInterstitial.created.push(ad);
      return ad;
    });
    load = jest.fn(() => {
      this.loaded = true;
      this.emit("loaded");
    });
    show = jest.fn(async () => {
      this.loaded = false;
      this.emit("opened");
    });
    addAdEventListener(type: string, listener: Listener) {
      const set = this.listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(type, set);
      return () => void set.delete(listener);
    }
    /** Tests: the member closes the ad. */
    close() {
      this.emit("closed");
    }
    private emit(type: string) {
      for (const listener of this.listeners.get(type) ?? []) listener();
    }
  }

  function BannerAd(props: { unitId: string; size: string; requestOptions?: Record<string, unknown> }) {
    return createElement(View, { testID: "google-banner", accessibilityLabel: `Google banner ${props.unitId}`, ...{ banner: props } });
  }

  return {
    __esModule: true,
    default: () => sdk,
    sdk,
    InterstitialAd: FakeInterstitial,
    BannerAd,
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: "ANCHORED_ADAPTIVE_BANNER", BANNER: "BANNER" },
    AdEventType: { LOADED: "loaded", ERROR: "error", OPENED: "opened", CLICKED: "clicked", CLOSED: "closed" },
    MaxAdContentRating: { G: "G", PG: "PG", T: "T", MA: "MA" },
  };
}
