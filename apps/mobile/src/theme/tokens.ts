/**
 * Provisional design tokens (the full design system is stage 13).
 * Text pairs checked with replica-design/contrast.py (WCAG):
 * text/surface 17.1:1, muted/surface 7.2:1, onPrimary/primary 8.8:1,
 * danger/surface 7.8:1, success/surface 6.5:1, border/surface 4.6:1.
 */
export const color = {
  text: "#1d1a24",
  muted: "#5b5566",
  primary: "#8a2148",
  onPrimary: "#ffffff",
  danger: "#a3123a",
  success: "#1f6b45",
  surface: "#ffffff",
  surfaceAlt: "#f6f2f7",
  border: "#7a7385",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, pill: 999 } as const;
export const font = {
  body: 16,
  small: 14,
  label: 15,
  title: 24,
  heading: 20,
} as const;
// 44 x 44 points: the minimum comfortable touch target.
export const touch = { min: 44 } as const;
export const size = { checkbox: 24, contentMax: 560, thumb: 96 } as const;
