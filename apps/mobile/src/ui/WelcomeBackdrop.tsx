/**
 * Phones: the candlelight loop's still behind the welcome screen, under the dark
 * overlay (stage 19, D099). The moving loop plays on the web
 * (WelcomeBackdrop.web.tsx); on phones it would need a native video module
 * (expo-video), a new dependency and a new app build, so it waits for the owner's
 * go. Decoration: hidden from screen readers.
 */
import { Image, StyleSheet, View } from "react-native";

import { MEDIA_URL } from "@/config";
import { color, overlay } from "@/theme/tokens";
import { loopVideo } from "@/ui/loopVideo";

const video = loopVideo(MEDIA_URL);

export function WelcomeBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
      <Image source={{ uri: video.large.poster }} style={StyleSheet.absoluteFill} resizeMode="cover" testID="welcome-still" />
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { backgroundColor: color.overlay, opacity: overlay.opacity },
});
