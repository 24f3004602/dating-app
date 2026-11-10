/**
 * The welcome screen's route map (the Interchange, stage 20e, D105): your line (teal)
 * and someone else's (marigold) run in, turn down at 45 degrees like a metro diagram,
 * and meet at the brand's rings, which meet as the screen opens (Rings, stage 19);
 * below them the two run on together. Drawn with Views (no SVG library): straight runs
 * and rotated bars, sized from the width the map is given. One image to screen
 * readers, described in a sentence.
 */
import { useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { t } from "@/i18n/en";
import { color, font, size } from "@/theme/tokens";
import { Rings } from "@/ui/Rings";

const H = 176; // the map's height
const T = 8; // a line's thickness
const STOP = 16; // a station roundel
// The rings at rest (Rings.tsx): diameter, and the distance between their centres.
const D = size.mark * 0.6;
const OVERLAP = D * 0.62;
const RING_BOX_W = D + OVERLAP + size.mark * 0.18 * 2;
const RING_BOX_H = D * 1.1;
const RING_Y = 100; // the rings' centre line
const EDGE = (D / 2) * Math.SQRT1_2; // from a ring's centre to its 45-degree edge, on each axis

/** A straight bar from (x1, y1) to (x2, y2), drawn as a rotated View. */
function bar(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
): ViewStyle {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return {
    position: "absolute",
    left: (x1 + x2) / 2 - length / 2,
    top: (y1 + y2) / 2 - T / 2,
    width: length,
    height: T,
    backgroundColor: colour,
    transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
  };
}

function stop(x: number, y: number): ViewStyle {
  return { position: "absolute", left: x - STOP / 2, top: y - STOP / 2 };
}

export function RouteMap() {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setW(Math.round(e.nativeEvent.layout.width));
  // The interchange in the middle gives both lines room for two stations each, even at 320 dp.
  const cx = w * 0.5;
  // Your line comes in high and turns down to the left ring; theirs, lower, to the right one.
  const youY = 28;
  const themY = 44;
  const leftRing = { x: cx - OVERLAP / 2, y: RING_Y };
  const rightRing = { x: cx + OVERLAP / 2, y: RING_Y };
  const youTurn = leftRing.x - EDGE - (leftRing.y - EDGE - youY);
  const themTurn = rightRing.x + EDGE + (rightRing.y - EDGE - themY);
  const below = RING_Y + D / 2;
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
      {w > 0 && (
        <View
          style={StyleSheet.absoluteFill}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={bar(0, youY, youTurn, youY, color.accent)} />
          <View
            style={bar(
              youTurn,
              youY,
              leftRing.x - EDGE,
              leftRing.y - EDGE,
              color.accent,
            )}
          />
          <View style={bar(w, themY, themTurn, themY, color.highlight)} />
          <View
            style={bar(
              themTurn,
              themY,
              rightRing.x + EDGE,
              rightRing.y - EDGE,
              color.highlight,
            )}
          />
          <View style={bar(cx - 6, below - 4, cx - 6, H, color.accent)} />
          <View style={bar(cx + 6, below - 4, cx + 6, H, color.highlight)} />
          {[20, Math.min(52, youTurn - 18)].map((x) => (
            <View key={`you-${x}`} style={[styles.stop, stop(x, youY)]} />
          ))}
          {[w - 20, Math.max(w - 52, themTurn + 18)].map((x) => (
            <View key={`them-${x}`} style={[styles.stop, stop(x, themY)]} />
          ))}
          <View
            style={{
              position: "absolute",
              left: cx - RING_BOX_W / 2,
              top: RING_Y - RING_BOX_H / 2,
            }}
          >
            <Rings mode="meet" />
          </View>
          <Text style={[styles.small, { left: 4, top: 0 }]}>
            {t.welcome.map.you}
          </Text>
          <Text
            style={[styles.small, styles.right, { right: 4, top: themY - 26 }]}
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
  map: { height: H, width: "100%" },
  stop: {
    width: STOP,
    height: STOP,
    borderRadius: STOP / 2,
    borderWidth: 3,
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
