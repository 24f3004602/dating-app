import "server-only";

/**
 * The beta tester notice (stage 18, D096): the terms and privacy notice that
 * invited testers accept. Plain language, written for a small closed test; the
 * full, lawyer-reviewed documents come before any public launch (deploy.md).
 * Every statement must match what the app does today (features.csv): change
 * the text and the version together, and the API's TERMS_VERSION and
 * PRIVACY_VERSION and the app's EXPO_PUBLIC_*_VERSION with them.
 */
export const BETA_VERSION = "beta-2026-11";
// The notice version the waitlist form agrees to (D101). Keep it equal to the API's
// PRIVACY_VERSION; it is only overridden where the API runs another version (e2e).
export const PRIVACY_VERSION = process.env.PRIVACY_VERSION?.trim() || BETA_VERSION;
export const BETA_DATE = "5 November 2026";

/** Who runs the test, and how to reach them. Set on the server (web .env). */
export const OPERATOR =
  process.env.OPERATOR_NAME?.trim() || "the team running this test";
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL?.trim() || null;

/**
 * Where the beta's data lives (D096, D097), so the notice names the right
 * services: "lightsail" (a server at Amazon Web Services in Mumbai) or "home"
 * (the operator's own computer, reached through a Cloudflare Tunnel).
 */
export const BETA_HOSTING: "lightsail" | "home" =
  process.env.BETA_HOSTING === "home" ? "home" : "lightsail";
