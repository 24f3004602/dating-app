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
export const BETA_DATE = "5 November 2026";

/** Who runs the test, and how to reach them. Set on the server (web .env). */
export const OPERATOR = process.env.OPERATOR_NAME?.trim() || "the team running this test";
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL?.trim() || null;
