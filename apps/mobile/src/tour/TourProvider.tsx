/**
 * The app tour (D136): a walk along the line for someone new, in words and, if they like,
 * read aloud. It is offered once on each device to an account under `NEW_FOR_DAYS` old,
 * and anyone can take it again from You. Each stop opens its real place behind the card
 * (`TourStage`); the bottom bar stays live, so tapping a stop takes the tour there.
 * Nothing about it is sent anywhere: the device remembers the answer and the voice choice.
 */
import { type Href, usePathname, useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, BackHandler, Platform } from "react-native";

import { useMe, useMyProfile } from "@/api/hooks";
import { useLive } from "@/api/live";
import { tourMemory } from "@/tour/memory";
import { isNewAccount, offerText, PLACE_PATH, spoken, type TourStop, tourStops } from "@/tour/stops";
import { canSpeak, hush, prepareVoice, say } from "@/tour/voice";

export type TourPhase = "closed" | "offer" | "touring";

export type TourValue = {
  phase: TourPhase;
  stops: TourStop[];
  index: number;
  /** `supported`: this device can read aloud; `failed`: it tried and couldn't (voice off until chosen again). */
  voice: { supported: boolean; on: boolean; failed: boolean };
  /** undefined until known. */
  hasProfile: boolean | undefined;
  begin: () => void;
  later: () => void;
  replay: () => void;
  next: () => void;
  back: () => void;
  close: () => void;
  setVoice: (on: boolean) => void;
  listen: () => void;
  createProfile: () => void;
};

const TourContext = createContext<TourValue | null>(null);

/** The tour, or null outside the signed-in app (screen tests, the design gallery). */
export function useTour(): TourValue | null {
  return useContext(TourContext);
}

const TOUR_PATHS = new Set<string>(Object.values(PLACE_PATH));

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const [phase, setPhase] = useState<TourPhase>("closed");
  const [index, setIndex] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [failed, setFailed] = useState(false);
  const open = phase !== "closed";
  // Live's numbers and whether there's a profile, fetched only while the tour is open.
  const live = useLive({ enabled: open });
  const profile = useMyProfile({ enabled: open });
  const hasProfile = profile.data === undefined ? undefined : profile.data !== null;
  const stops = useMemo(() => tourStops({ live: live.data, hasProfile }), [live.data, hasProfile]);
  const supported = canSpeak();

  // The latest of everything, for actions that run later (a press, a back gesture, a route change).
  const now = useRef({ phase, index, stops, voiceOn, pathname });
  now.current = { phase, index, stops, voiceOn, pathname };
  /** A place the tour itself is opening: its route change isn't a tap on the bar. */
  const opening = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Offered once on this device, to an account that's new.
  const considered = useRef(false);
  useEffect(() => {
    const account = me.data;
    if (considered.current || !account) return;
    considered.current = true;
    void tourMemory.offered().then((offered) => {
      if (mounted.current && !offered && isNewAccount(account.created_at)) setPhase((p) => (p === "closed" ? "offer" : p));
    });
  }, [me.data]);

  // Reading aloud starts on, unless it was turned off here before, or a phone's screen reader
  // is on (it reads the card already; the web can't tell, and the offer's switch is first).
  useEffect(() => {
    void (async () => {
      const chosen = await tourMemory.voice();
      if (!mounted.current) return;
      if (chosen !== null) setVoiceOn(chosen);
      else if (Platform.OS !== "web" && (await AccessibilityInfo.isScreenReaderEnabled().catch(() => false))) {
        if (mounted.current) setVoiceOn(false);
      }
    })();
  }, []);

  // The device's voices are looked through while the offer is read, before the first word.
  useEffect(() => {
    if (open) void prepareVoice();
  }, [open]);

  const voiceFailed = useCallback(() => {
    if (!mounted.current) return;
    setFailed(true);
    setVoiceOn(false);
  }, []);
  const speak = useCallback((text: string) => say(text, { failed: voiceFailed }), [voiceFailed]);

  /** Shows stop `i`: its place behind the card (unless a tap on the bar already opened it), and its words aloud. */
  const go = useCallback(
    (i: number, { navigate = true }: { navigate?: boolean } = {}) => {
      const stop = now.current.stops[i];
      if (!stop) return;
      setIndex(i);
      const path = PLACE_PATH[stop.place];
      if (navigate && now.current.pathname !== path) {
        opening.current = path;
        router.navigate(path as Href);
      }
      if (now.current.voiceOn && supported) speak(spoken(stop));
      else hush();
    },
    [router, speak, supported],
  );

  const close = useCallback(() => {
    hush();
    opening.current = null;
    setPhase("closed");
    setIndex(0);
  }, []);

  const later = useCallback(() => {
    void tourMemory.markOffered();
    close();
  }, [close]);

  const begin = useCallback(() => {
    void tourMemory.markOffered();
    setPhase("touring");
    go(0);
  }, [go]);

  const replay = useCallback(() => {
    setPhase("touring");
    go(0);
  }, [go]);

  const next = useCallback(() => {
    const { index: i, stops: all } = now.current;
    if (i >= all.length - 1) close();
    else go(i + 1);
  }, [close, go]);

  const back = useCallback(() => {
    const i = now.current.index;
    if (i > 0) go(i - 1);
  }, [go]);

  /** Says what the card shows now: the offer, or the current stop. */
  const listen = useCallback(() => {
    const { phase: p, stops: all, index: i } = now.current;
    if (!supported) return;
    if (p === "offer") speak(spoken(offerText()));
    else if (p === "touring" && all[i]) speak(spoken(all[i]));
  }, [speak, supported]);

  const setVoice = useCallback(
    (on: boolean) => {
      now.current.voiceOn = on;
      setVoiceOn(on);
      setFailed(false);
      void tourMemory.setVoice(on);
      if (on) listen();
      else hush();
    },
    [listen],
  );

  const createProfile = useCallback(() => {
    close();
    router.push("/profile/edit");
  }, [close, router]);

  // A tap on the line's stops moves the tour to that place; a screen opened above the
  // places (a notification, say) quietens it until the places are back.
  useEffect(() => {
    if (now.current.phase !== "touring") return;
    if (!TOUR_PATHS.has(pathname)) {
      hush();
      return;
    }
    if (opening.current === pathname) {
      opening.current = null;
      return;
    }
    opening.current = null;
    const { stops: all, index: i } = now.current;
    if (all[i] && PLACE_PATH[all[i].place] === pathname) return;
    const tapped = all.findIndex((s) => PLACE_PATH[s.place] === pathname);
    if (tapped >= 0) go(tapped, { navigate: false });
  }, [pathname, go]);

  // Quiet whenever the app leaves the screen, and when the signed-in app goes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") hush();
    });
    return () => {
      sub.remove();
      hush();
    };
  }, []);

  // Android's Back closes the card (the offer counts as answered). The web has Escape instead.
  useEffect(() => {
    if (!open || Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (now.current.phase === "offer") later();
      else close();
      return true;
    });
    return () => sub.remove();
  }, [open, later, close]);

  const value = useMemo<TourValue>(
    () => ({
      phase,
      stops,
      index,
      voice: { supported, on: voiceOn && supported, failed },
      hasProfile,
      begin,
      later,
      replay,
      next,
      back,
      close,
      setVoice,
      listen,
      createProfile,
    }),
    [phase, stops, index, supported, voiceOn, failed, hasProfile, begin, later, replay, next, back, close, setVoice, listen, createProfile],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
