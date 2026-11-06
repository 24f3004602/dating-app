/**
 * Motion (stage 19, D098): small, calm animations on React Native's own
 * Animated, with no animation library.
 *
 * - Only opacity and transforms move. On phones the native driver runs them off
 *   the JavaScript thread; on the web Animated updates them each frame.
 * - Every animation follows the reduce-motion setting: the phone's, or the
 *   browser's `prefers-reduced-motion`. With it on, things appear in their final
 *   state at once. Until the setting is known (a moment on phones, never on the
 *   web), nothing moves.
 * - Durations and easing come from the motion tokens (theme/tokens.ts).
 * - On the web each animated element says what it did in `data-motion`
 *   ("animated" or "still"), so the e2e can check both without racing a clock.
 */
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type ImageProps,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { motion } from "@/theme/tokens";

/** Phones run animations natively; React Native Web has no native driver (and warns if asked). */
export const nativeDriver = Platform.OS !== "web";

type Curve = readonly [number, number, number, number];
const bezier = (c: Curve) => Easing.bezier(c[0], c[1], c[2], c[3]);
export const easing = { standard: bezier(motion.easing.standard), decelerate: bezier(motion.easing.decelerate) };

// --- the reduce-motion setting, shared by every component ----------------------

function webSetting(): boolean | null {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let known: boolean | null = webSetting();
let subscribed = false;
const listeners = new Set<() => void>();

function publish(value: boolean) {
  known = value;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (!subscribed) {
    subscribed = true;
    // If the setting can't be read, stay still rather than guess.
    AccessibilityInfo.isReduceMotionEnabled().then(publish, () => publish(true));
    AccessibilityInfo.addEventListener("reduceMotionChanged", publish);
  }
  return () => void listeners.delete(notify);
}

const snapshot = () => known;

/** Tests only: forget the setting, so the next component reads the (mocked) platform again. */
export function resetMotionSetting() {
  known = webSetting();
  subscribed = false;
}

/** true: reduce motion; false: animate; null: not known yet (treat as still). */
export function useMotionSetting(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** For decisions that need a yes or no now (screen transitions): unknown counts as reduce. */
export function useReducedMotion(): boolean {
  return useMotionSetting() ?? true;
}

type MotionState = "animated" | "still" | "pending";

/** On the web: `data-motion` on the element (React Native Web turns `dataSet` into data-* attributes). */
function motionData(state: MotionState): object {
  return Platform.OS === "web" ? { dataSet: { motion: state } } : {};
}

// --- entrances ------------------------------------------------------------------

type Entrance = {
  /** Show in place at once: it was already on screen (nothing new). Read once, on mount. */
  appear?: boolean;
  delay?: number;
  duration?: number;
};

/**
 * 0 to 1 as something appears. Decided once, on mount: a component that is
 * already showing never fades out and in again when its props change.
 */
function useEntrance({ appear = true, delay = 0, duration = motion.duration.base }: Entrance) {
  const setting = useMotionSetting();
  const mount = useRef({ appear, delay, duration }).current;
  const progress = useRef(new Animated.Value(mount.appear ? 0 : 1)).current;

  useEffect(() => {
    if (!mount.appear || setting === null) return;
    if (setting) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: mount.duration,
      delay: mount.delay,
      easing: easing.decelerate,
      useNativeDriver: nativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [setting, mount, progress]);

  const state: MotionState = !mount.appear || setting === true ? "still" : setting === null ? "pending" : "animated";
  return { progress, state };
}

type RevealProps = Entrance & {
  children: ReactNode;
  /** Move up into place as well as fade in (the default), or only fade. */
  rise?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Fades (and by default rises) its children into place once, when they first appear. */
export function Reveal({ children, rise = true, style, ...entrance }: RevealProps) {
  const { progress, state } = useEntrance(entrance);
  const lift = rise
    ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.rise, 0] }) }]
    : undefined;
  return (
    <Animated.View style={[style, { opacity: progress, transform: lift }]} {...motionData(state)}>
      {children}
    </Animated.View>
  );
}

/** The gap between list items as they appear: the first few stagger, the rest come together. */
export function staggered(index: number): number {
  return Math.min(index, 6) * motion.stagger;
}

/** Screens fade in on the web, where there's no native transition between them. */
export function useScreenEntrance() {
  const web = Platform.OS === "web";
  const { progress, state } = useEntrance({ appear: web, duration: motion.duration.fast });
  return { style: { opacity: progress }, data: web ? motionData(state) : {} };
}

// --- press feedback --------------------------------------------------------------

/** A slight press-in for buttons and cards (their colours change as well, so nothing relies on it). */
export function usePressScale(to = 0.98) {
  const setting = useMotionSetting();
  const scale = useRef(new Animated.Value(1)).current;
  const go = (value: number) => {
    if (setting !== false) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: value,
      duration: motion.duration.fast,
      easing: easing.standard,
      useNativeDriver: nativeDriver,
    }).start();
  };
  return { style: { transform: [{ scale }] }, onPressIn: () => go(to), onPressOut: () => go(1) };
}

// --- images ------------------------------------------------------------------------

/**
 * An image that fades in when it has loaded, instead of popping in. Before that,
 * the box behind it (its placeholder colour) shows.
 */
export function FadeImage(props: ImageProps) {
  const setting = useMotionSetting();
  const current = useRef(setting);
  current.current = setting;
  const opacity = useRef(new Animated.Value(setting === false ? 0 : 1)).current;

  useEffect(() => {
    if (setting === true) opacity.setValue(1);
  }, [setting, opacity]);

  const { onLoad } = props;
  return (
    <Animated.Image
      {...props}
      style={[props.style, { opacity }]}
      onLoad={(event) => {
        if (current.current === false) {
          Animated.timing(opacity, {
            toValue: 1,
            duration: motion.duration.base,
            easing: easing.decelerate,
            useNativeDriver: nativeDriver,
          }).start();
        } else {
          opacity.setValue(1);
        }
        onLoad?.(event);
      }}
    />
  );
}
