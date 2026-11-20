/**
 * In-app ads on Android (D137): who sees them, the start of Google's ads SDK, and full-screen ads
 * at natural breaks. A member with Plus, or whose plan can't be read yet, sees none, and their
 * app never starts the SDK (with app measurement held until it starts, nothing goes to Google).
 * Ads are always non-personalised and rated for teens and up, and pause while the tour is open.
 */
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import mobileAds, { AdEventType, InterstitialAd, MaxAdContentRating } from "react-native-google-mobile-ads";

import { AD_REQUEST, AD_UNITS, ADS_IN_BUILD, type BreakState, fullScreenDue } from "@/ads/config";
import { useMe } from "@/api/hooks";
import { useSubscription } from "@/api/live";
import { useTour } from "@/tour/TourProvider";

type AdsValue = { banners: boolean };

const AdsContext = createContext<AdsValue>({ banners: false });

/** Whether a banner may show now (the places are chosen by the banner itself). */
export function useAds(): AdsValue {
  return useContext(AdsContext);
}

const DAY = 24 * 60 * 60_000;
const SHOWN = "ads.fullscreen";

/** When full-screen ads were shown in the last day, so a restart doesn't reset the daily cap. */
const shownMemory = {
  async read(): Promise<number[]> {
    try {
      const raw = await SecureStore.getItemAsync(SHOWN);
      const list: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((t): t is number => typeof t === "number") : [];
    } catch {
      return [];
    }
  },
  write(times: number[]): void {
    void SecureStore.setItemAsync(SHOWN, JSON.stringify(times)).catch(() => undefined);
  },
};

export function AdsProvider({ children }: { children: ReactNode }) {
  const tour = useTour();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  // Only builds with ads ask about the plan for them; an unknown plan counts as Plus (no ads).
  const plan = useSubscription({ enabled: ADS_IN_BUILD });
  const eligible = ADS_IN_BUILD && plan.data?.entitled === false;
  const [ready, setReady] = useState(false);
  const touring = !!tour && tour.phase !== "closed";

  // Google's SDK starts only for a member who will see ads.
  useEffect(() => {
    if (!eligible || ready) return;
    let current = true;
    void (async () => {
      try {
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.T,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await mobileAds().initialize();
        if (current) setReady(true);
      } catch {
        // No ads this time; the app works the same without them.
      }
    })();
    return () => {
      current = false;
    };
  }, [eligible, ready]);

  // One full-screen ad is kept loaded while the member may see one, and replaced after it closes.
  const ad = useRef<InterstitialAd | null>(null);
  useEffect(() => {
    if (!eligible || !ready) return;
    const next = InterstitialAd.createForAdRequest(AD_UNITS.interstitial, AD_REQUEST);
    const unsubscribe = next.addAdEventListener(AdEventType.CLOSED, () => next.load());
    next.load();
    ad.current = next;
    return () => {
      unsubscribe();
      ad.current = null;
    };
  }, [eligible, ready]);

  // Decisions (like or pass) are counted as the app makes them, whichever screen made them.
  const counts = useRef<Pick<BreakState, "decisions" | "lastWasMatch">>({ decisions: 0, lastWasMatch: false });
  useEffect(
    () =>
      qc.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        if (event.mutation.options.mutationKey?.[0] !== "decide") return;
        counts.current = {
          decisions: counts.current.decisions + 1,
          lastWasMatch: Boolean((event.action.data as { match?: unknown } | undefined)?.match),
        };
      }),
    [qc],
  );

  const shown = useRef<number[]>([]);
  useEffect(() => {
    void shownMemory.read().then((times) => {
      shown.current = times;
    });
  }, []);

  // The natural break: back on Today from someone's profile.
  const previous = useRef(pathname);
  const joined = me.data ? Date.parse(me.data.created_at) : Number.NaN;
  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (pathname !== "/discover" || !from.startsWith("/person/")) return;
    const loaded = ad.current;
    if (!eligible || !ready || touring || !loaded?.loaded) return;
    const now = Date.now();
    if (!fullScreenDue({ ...counts.current, shown: shown.current, joined, now })) return;
    counts.current = { decisions: 0, lastWasMatch: false };
    shown.current = [...shown.current.filter((t) => now - t < DAY), now];
    shownMemory.write(shown.current);
    loaded.show().catch(() => undefined);
  }, [pathname, eligible, ready, touring, joined]);

  const value = useMemo<AdsValue>(() => ({ banners: eligible && ready && !touring }), [eligible, ready, touring]);
  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
