/**
 * The top app bar as a station sign (the Interchange, stage 20e, D105): graphite,
 * lettered in white in the sign face, no shadow (the world is flat enamel). Android's
 * structure stays (system Back, the bar's own back arrow); only the theme is ours.
 */
import { color, font } from "@/theme/tokens";

export const signHeader = {
  headerStyle: { backgroundColor: color.sign },
  headerTintColor: color.onSign,
  headerTitleStyle: { fontFamily: font.sign },
  headerShadowVisible: false,
} as const;
