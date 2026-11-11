/**
 * The bottom bar as a line with four stops (the Interchange, stage 20e, D105): an
 * Android navigation bar for the main places, drawn in our world. Your line and theirs
 * run across it together; each place is a station roundel with its name, and the place
 * you're at is a filled stop with its name on a graphite sign. A tab to assistive tech
 * (role and selected state); each stop is a quarter of the bar, well over 48 dp.
 */
import type { ComponentProps, ReactNode } from "react";
import { Pressable, type PressableProps, StyleSheet, Text, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, font, space, touch } from "@/theme/tokens";

const STOP = 18;
const RAIL = 4;
const STOP_TOP = space.sm; // the roundels' top edge inside each stop

/** The bar itself; `TabList asChild` passes its props and the triggers through. */
export function LineBar({ children, label, style, ...rest }: ViewProps & { children: ReactNode; label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View role="tablist" aria-label={label} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }, style]} {...rest}>
      {/* The two rails behind the stops, from the first stop's centre to the last's. */}
      <View style={styles.rails} pointerEvents="none" aria-hidden>
        <View style={[styles.rail, { backgroundColor: color.accent }]} />
        <View style={[styles.rail, { backgroundColor: color.highlight }]} />
      </View>
      {children}
    </View>
  );
}

type StopProps = PressableProps & { label: string; isFocused?: boolean; ref?: ComponentProps<typeof Pressable>["ref"] };

/** One place on the line. `TabTrigger asChild` gives it `isFocused` and `onPress`. */
export function Stop({ label, isFocused, ref, ...press }: StopProps) {
  return (
    <Pressable
      ref={ref}
      {...press}
      role="tab"
      aria-selected={!!isFocused}
      accessibilityState={{ selected: !!isFocused }}
      aria-label={label}
      style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
    >
      <View style={[styles.roundel, isFocused && styles.roundelHere]} />
      <View style={[styles.name, isFocused && styles.nameHere]}>
        <Text style={[styles.label, isFocused && styles.labelHere]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.bg,
    borderTopWidth: 2,
    borderTopColor: color.sign,
  },
  // Spans the middle of the first and last quarter: 12.5% in from each side.
  rails: { position: "absolute", left: "12.5%", right: "12.5%", top: STOP_TOP + STOP / 2 - RAIL - 1, gap: 2 },
  rail: { height: RAIL },
  stop: { flex: 1, minHeight: touch.min + space.lg, alignItems: "center", paddingTop: STOP_TOP, gap: space.xs },
  pressed: { backgroundColor: color.surface },
  roundel: {
    width: STOP,
    height: STOP,
    borderRadius: STOP / 2,
    borderWidth: 3,
    borderColor: color.sign,
    backgroundColor: color.bg,
  },
  roundelHere: { backgroundColor: color.sign },
  name: { paddingHorizontal: space.sm, paddingVertical: 2 },
  nameHere: { backgroundColor: color.sign },
  label: { fontFamily: font.text, fontSize: 13, lineHeight: 18, color: color.textMuted },
  labelHere: { fontFamily: font.sign, color: color.onSign },
});
