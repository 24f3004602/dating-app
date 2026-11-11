/**
 * The top bar's More options (Android's overflow menu button, drawn, stage 20e): three
 * dots in the sign's white on a 48-point target, with the platform's ripple on Android.
 * Pressed, the dots dim; on the web, keyboard focus is a marigold ring (checked on graphite).
 */
import { Platform, Pressable, type PressableStateCallbackType, StyleSheet, View, type ViewStyle } from "react-native";

import { color, focusRing, space, touch } from "@/theme/tokens";

type PressState = PressableStateCallbackType & { focused?: boolean };
const ring: ViewStyle =
  Platform.OS === "web"
    ? { outlineColor: color.highlight, outlineStyle: "solid", outlineWidth: focusRing.width, outlineOffset: -focusRing.width }
    : {};

export function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      android_ripple={{ color: color.onSignMuted, borderless: true, radius: touch.min / 2 }}
      style={(state) => [styles.target, !!(state as PressState).focused && ring]}
    >
      {({ pressed }) => (
        <View style={styles.dots} aria-hidden>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, pressed && styles.dotPressed]} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center" },
  dots: { gap: space.xs },
  dot: { width: space.xs, height: space.xs, borderRadius: space.xs / 2, backgroundColor: color.onSign },
  dotPressed: { backgroundColor: color.onSignMuted },
});
