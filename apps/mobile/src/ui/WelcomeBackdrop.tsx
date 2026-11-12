/**
 * Phones: the candlelight loop's still behind the welcome screen, under the dark
 * overlay (stage 19, D099). The still ships inside the app (the website's own 17.8 KB
 * file), so the first screen never waits on the network for it (impeccable's finish
 * review found it missing on the phone; D116). The moving loop plays on the web
 * (WelcomeBackdrop.web.tsx); on phones it would need a native video module
 * (expo-video), a new dependency and a new app build, so it waits for the owner's
 * go. Decoration: hidden from screen readers.
 */
import { Image, StyleSheet, View } from "react-native";

import { color, overlay } from "@/theme/tokens";

const STILL = require("../../assets/media/candles-v1-720.webp");

export function WelcomeBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
      <Image source={STILL} style={StyleSheet.absoluteFill} resizeMode="cover" testID="welcome-still" />
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { backgroundColor: color.overlay, opacity: overlay.opacity },
});
