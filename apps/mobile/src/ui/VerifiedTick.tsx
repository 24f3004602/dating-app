/**
 * The blue tick (stage 29b, D164): a blue roundel with a white tick, always with its words beside
 * it, so it never claims more than it says: our team compared a selfie with these photos. It sits
 * on the page or a tinted panel, never on a graphite plate (the blue would be too dark there).
 */
import { StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n/en";
import { color, size, space, type } from "@/theme/tokens";

export function VerifiedTick() {
  return (
    <View style={styles.row}>
      <View style={styles.roundel} aria-hidden>
        <View style={styles.tick} />
      </View>
      <Text style={styles.text}>{t.tick.label}</Text>
    </View>
  );
}

const MARK = size.checkbox; // drawn in points, so it doesn't outgrow its roundel at large text sizes (D115)

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  roundel: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: color.verified,
    alignItems: "center",
    justifyContent: "center",
  },
  // Two sides of a small box, turned: the checkbox's own tick, in white.
  tick: {
    width: MARK * 0.3,
    height: MARK * 0.5,
    marginTop: -MARK * 0.125,
    borderRightWidth: size.roundelStroke,
    borderBottomWidth: size.roundelStroke,
    borderColor: color.onAccent,
    transform: [{ rotate: "45deg" }],
  },
  text: { ...type.caption, color: color.text },
});
