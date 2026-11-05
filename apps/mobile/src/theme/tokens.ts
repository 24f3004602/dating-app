/**
 * Design tokens (stage 13, D088). Mirrors `replica/design/tokens.json`, which
 * the WCAG checker reads (`tokens.test.ts` keeps the two equal and re-checks
 * every listed pair). Roles, not colours: a rebrand changes values, never names.
 * Components use these and nothing else: no raw colours, sizes or fonts.
 */
import type { TextStyle } from "react-native";

export const color = {
  /** The page. */
  bg: "#ffffff",
  /** Tinted panels: prompts, the other person's messages, photo placeholders, disabled controls. */
  surface: "#f5f3f0",
  /** Decorative lines only (dividers). Never the edge of a control. */
  border: "#e4e0da",
  /** The edge of a control (inputs, checkboxes, chips, cards): at least 3:1 on bg and surface. */
  borderInput: "#78736b",
  text: "#1c1b19",
  textMuted: "#5c5852",
  accent: "#0e6670",
  accentPressed: "#08535a",
  accentSoft: "#e6f3f3",
  onAccent: "#ffffff",
  /** Marigold, for "your turn"-style badges, always with `text` on it. With the peacock accent: D089. */
  highlight: "#f5b544",
  danger: "#a3123a",
  dangerSoft: "#fdecf0",
  success: "#1f6b45",
  successSoft: "#e7f3ec",
  /** The keyboard focus ring (web), drawn outside the control over bg or surface. */
  focus: "#2453c4",
} as const;

/** System fonts: no font files to license or download. Line heights scale with the user's text size. */
export const type = {
  caption: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  label: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: "600" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
} as const satisfies Record<string, TextStyle>;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
/** 48 points for buttons and fields (Android's guidance; above Apple's 44); chips and links at least 44. */
export const touch = { min: 48, chip: 44 } as const;
export const focusRing = { width: 2, offset: 2 } as const;
export const size = { checkbox: 24, contentMax: 560, thumb: 96, multiline: 96 } as const;
