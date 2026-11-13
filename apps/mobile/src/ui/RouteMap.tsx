/**
 * The welcome screen's route map (the Interchange, stage 20e, D105): your line (teal)
 * and someone else's (marigold) run in, turn down at 45 degrees like a metro diagram,
 * and meet at the brand's rings, which meet as the screen opens (Rings, stage 19);
 * below them the two run on together. Drawn with views (no SVG library) from the map's
 * data (welcomeMap.ts), sized from the width the map is given. One image to screen
 * readers, described in a sentence.
 *
 * Stage 21b (D122): where motion is welcome, the same map in 3D is laid over it once the
 * screen is idle (Welcome3D): the map lifts into relief and their ring hooks through
 * yours. Its rings fade in as these fade out; the labels stay on top.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { t } from "@/i18n/en";
import { color, font, motion } from "@/theme/tokens";
import { easing, nativeDriver } from "@/ui/motion";
import { RING, Rings } from "@/ui/Rings";
import { type ScenePhase, Welcome3D } from "@/ui/Welcome3D";
import { type Bar, bars, MAP, welcomeMap } from "@/ui/welcomeMap";

const TONE = { teal: color.accent, marigold: color.highlight } as const;

/** A straight piece of a line, as a rotated view. */
function barStyle(b: Bar, colour: string): ViewStyle {
  return {
    position: "absolute",
    left: b.cx - b.length / 2,
    top: b.cy - MAP.line / 2,
    width: b.length,
    height: MAP.line,
    backgroundColor: colour,
    transform: [{ rotate: `${b.angle}rad` }],
  };
}

function stop(x: number, y: number): ViewStyle {
  return { position: "absolute", left: x - MAP.stop / 2, top: y - MAP.stop / 2 };
}

export function RouteMap() {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setW(Math.round(e.nativeEvent.layout.width));
  const map = useMemo(() => (w > 0 ? welcomeMap(w) : null), [w]);
  // The flat rings fade out under the 3D scene's (whose rings fade in), and come back with the flat map.
  const rings = useRef(new Animated.Value(1)).current;
  const onPhase = useCallback(
    (phase: ScenePhase) => {
      rings.stopAnimation();
      if (phase === "3d") {
        Animated.timing(rings, {
          toValue: 0,
          duration: motion.duration.base,
          easing: easing.standard,
          useNativeDriver: nativeDriver,
        }).start();
      } else {
        rings.setValue(1);
      }
    },
    [rings],
  );
  const cx = w * 0.5;
  const below = MAP.ringY + RING.diameter / 2;
  return (
    <View
      style={styles.map}
      onLayout={onLayout}
      // One focus stop that reads the description, not the drawn pieces.
      accessible
      role="img"
      aria-label={t.welcome.map.label}
      accessibilityLabel={t.welcome.map.label}
    >
      {map && (
        <View
          style={StyleSheet.absoluteFill}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          {[...map.lines, ...map.rails].flatMap((line, i) =>
            bars(line.d, map.lineWidth).map((b, j) => (
              <View key={`${i}-${j}`} style={barStyle(b, TONE[line.tone])} />
            )),
          )}
          {map.stations.map((s) => (
            <View key={`${s.tone}-${s.x}`} style={[styles.stop, stop(s.x, s.y)]} />
          ))}
          <Welcome3D map={map} onPhase={onPhase} />
          <Animated.View
            style={{
              position: "absolute",
              left: cx - RING.width / 2,
              top: MAP.ringY - RING.height / 2,
              opacity: rings,
            }}
          >
            <Rings mode="meet" />
          </Animated.View>
          <Text style={[styles.small, { left: 4, top: 0 }]}>
            {t.welcome.map.you}
          </Text>
          <Text
            style={[
              styles.small,
              styles.right,
              { right: 4, top: MAP.themY - 26 },
            ]}
          >
            {t.welcome.map.them}
          </Text>
          <Text style={[styles.label, { left: cx + 20, top: below + 6 }]}>
            {t.welcome.map.both}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: MAP.height, width: "100%" },
  stop: {
    width: MAP.stop,
    height: MAP.stop,
    borderRadius: MAP.stop / 2,
    borderWidth: MAP.stopStroke,
    borderColor: color.sign,
    backgroundColor: color.bg,
  },
  small: {
    position: "absolute",
    fontFamily: font.textSemibold,
    fontSize: 13,
    lineHeight: 18,
    color: color.textMuted,
  },
  right: { textAlign: "right" },
  label: {
    position: "absolute",
    fontFamily: font.sign,
    fontSize: 20,
    lineHeight: 24,
    color: color.sign,
  },
});
