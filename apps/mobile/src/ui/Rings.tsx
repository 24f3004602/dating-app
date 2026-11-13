/**
 * The brand mark in motion (stage 19, D098): two rings, two people meeting. It's
 * decoration, so it's hidden from screen readers; whatever it marks is always
 * said in text beside it.
 *
 * - meet: the rings drift together once (the welcome screen).
 * - breathe: they swell gently twice, then rest (a day with no new introductions).
 *   Two cycles stay under 5 seconds, so nothing moves on and on (WCAG 2.2.2).
 * - join: they come together, once (a match). No glow: the world is flat enamel (D117).
 *
 * With reduce motion on they're drawn at rest, overlapping.
 */
import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";

import { color, motion, size } from "@/theme/tokens";
import { easing, nativeDriver, useMotionSetting } from "@/ui/motion";
import { useOnOverlay } from "@/ui/primitives";

export type RingsMode = "meet" | "breathe" | "join";

const S = size.mark;
const D = S * 0.6; // ring diameter
const STROKE = S * 0.06;
const OVERLAP = D * 0.62; // distance between the ring centres at rest
const APART = S * 0.18; // how far each ring starts from its rest position
const WIDTH = D + OVERLAP + APART * 2;
// The mark's box: a little room for the breath.
const BOX = D * 1.1;

/**
 * The mark's proportions, in points: a ring's outer diameter and stroke, the distance
 * between the two centres at rest, and the box it's drawn in. The welcome map places it by
 * these (welcomeMap.ts), and the 3D welcome was recorded for them (D122; a test checks).
 */
export const RING = { diameter: D, stroke: STROKE, apart: OVERLAP, width: WIDTH, height: BOX } as const;

export function Rings({ mode }: { mode: RingsMode }) {
  const setting = useMotionSetting();
  // Over the welcome screen's dark overlay, the teal ring would vanish: it turns white.
  const first = useOnOverlay() ? color.onAccent : color.accent;
  // together: 0 apart, 1 at rest. pulse: 0 to 1 and back (the breath).
  const together = useRef(new Animated.Value(mode === "breathe" ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const state = setting === null ? "pending" : setting ? "still" : "animated";

  useEffect(() => {
    if (setting === null) return;
    if (setting) {
      together.setValue(1);
      pulse.setValue(0);
      return;
    }
    const timing = (value: Animated.Value, toValue: number, duration: number, curve = easing.standard) =>
      Animated.timing(value, { toValue, duration, easing: curve, useNativeDriver: nativeDriver });
    const half = motion.duration.loop / 2;
    const animation =
      mode === "breathe"
        ? Animated.loop(Animated.sequence([timing(pulse, 1, half), timing(pulse, 0, half)]), { iterations: 2 })
        : timing(together, 1, motion.duration.hero, easing.decelerate);
    animation.start();
    return () => animation.stop();
  }, [setting, mode, together, pulse]);

  const shift = (side: -1 | 1) => together.interpolate({ inputRange: [0, 1], outputRange: [side * APART, 0] });
  const fade = mode === "breathe" ? 1 : together.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });
  const breath = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const box = BOX;
  const ring = (side: -1 | 1, tint: string) => (
    <Animated.View
      style={[
        styles.ring,
        { borderColor: tint, left: side < 0 ? APART : APART + OVERLAP, top: (box - D) / 2 },
        {
          opacity: fade,
          transform: [{ translateX: shift(side) }, ...(mode === "breathe" ? [{ scale: breath }] : [])],
        },
      ]}
    />
  );

  return (
    <View
      style={[styles.mark, { height: box }]}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      {...(Platform.OS === "web" ? { dataSet: { motion: state, rings: mode } } : {})}
    >
      {ring(-1, first)}
      {ring(1, color.highlight)}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: WIDTH, alignSelf: "center" },
  ring: { position: "absolute", width: D, height: D, borderRadius: D / 2, borderWidth: STROKE },
});
