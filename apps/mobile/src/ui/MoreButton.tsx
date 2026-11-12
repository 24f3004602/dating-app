/**
 * More options (Android's overflow menu button, drawn, stage 20e): three dots on a
 * 48-point target, with the platform's ripple on Android. `tone="onSign"` (the default)
 * is the top bar's: white dots and a marigold focus ring (checked on graphite);
 * `tone="sign"` sits on the page: graphite dots and the page's focus ring. Pressed, the dots dim.
 */
import { Platform, Pressable, type PressableStateCallbackType, StyleSheet, View, type ViewStyle } from "react-native";

import { color, focusRing, space, touch } from "@/theme/tokens";

type Tone = "onSign" | "sign";
type PressState = PressableStateCallbackType & { focused?: boolean };
const ring = (focus: string): ViewStyle =>
  Platform.OS === "web" ? { outlineColor: focus, outlineStyle: "solid", outlineWidth: focusRing.width, outlineOffset: -focusRing.width } : {};
const TONES: Record<Tone, { dot: string; pressed: string; ring: ViewStyle }> = {
  onSign: { dot: color.onSign, pressed: color.onSignMuted, ring: ring(color.highlight) },
  sign: { dot: color.sign, pressed: color.textMuted, ring: ring(color.focus) },
};

export function MoreButton({ label, onPress, tone = "onSign" }: { label: string; onPress: () => void; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      android_ripple={{ color: t.pressed, borderless: true, radius: touch.min / 2 }}
      style={(state) => [styles.target, !!(state as PressState).focused && t.ring]}
    >
      {({ pressed }) => (
        <View style={styles.dots} aria-hidden>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: pressed ? t.pressed : t.dot }]} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center" },
  dots: { gap: space.xs },
  dot: { width: space.xs, height: space.xs, borderRadius: space.xs / 2 },
});
