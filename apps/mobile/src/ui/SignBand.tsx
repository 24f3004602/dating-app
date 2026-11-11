/**
 * The station sign over the main places (the Interchange, stage 20e, D105): a graphite
 * band under the status bar with the working name, and the name in Devanagari when it
 * is configured. Where you are is told by the bottom bar's stop and the screen's own
 * heading, so the band carries the name, not the place.
 */
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BRAND, BRAND_DEVANAGARI } from "@/config";
import { color, font, space } from "@/theme/tokens";

export function SignBand() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.band, { paddingTop: insets.top + space.sm }]}>
      <Text style={styles.brand}>{BRAND}</Text>
      {BRAND_DEVANAGARI ? (
        <Text style={styles.hindi} accessibilityLanguage="hi">
          {BRAND_DEVANAGARI}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
    backgroundColor: color.sign,
  },
  brand: { fontFamily: font.sign, fontSize: 20, lineHeight: 24, letterSpacing: 1, textTransform: "uppercase", color: color.onSign },
  hindi: { fontFamily: font.devanagari, fontSize: 17, lineHeight: 22, color: color.onSign },
});
