/**
 * Anek, the Interchange's type (stage 20e, D105): one static file per voice, built by
 * apps/web/scripts/build_fonts.py from Ek Type's variable fonts (OFL-1.1, assets/fonts).
 * Loaded at runtime, which works in Expo Go and on the web build alike; the family
 * names are the tokens' `font` roles.
 */
import { useFonts } from "expo-font";

import { font } from "@/theme/tokens";

export const FONT_FILES = {
  [font.text]: require("../../assets/fonts/anek-text.ttf"),
  [font.textSemibold]: require("../../assets/fonts/anek-text-semibold.ttf"),
  [font.sign]: require("../../assets/fonts/anek-sign.ttf"),
  [font.display]: require("../../assets/fonts/anek-display.ttf"),
  [font.devanagari]: require("../../assets/fonts/anek-devanagari.ttf"),
};

/** True once the fonts are ready, or once loading has failed: the system font then stands in. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_FILES);
  return loaded || error != null;
}
