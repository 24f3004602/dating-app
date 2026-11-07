// The API base URL. Set EXPO_PUBLIC_API_URL for devices on the LAN; the
// default suits the web build and emulators that forward localhost.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// Versions of the documents shown at sign-up. The API refuses a mismatch with
// `consent_required` and the versions it expects; the beta uses the tester
// notice ("beta-" versions, D096) and production needs final, legally reviewed
// versions (D044). Build-time values (EXPO_PUBLIC_*), kept equal to the API's.
export const DOCUMENT_VERSIONS = {
  terms: process.env.EXPO_PUBLIC_TERMS_VERSION ?? "draft-2026-11",
  privacy: process.env.EXPO_PUBLIC_PRIVACY_VERSION ?? "draft-2026-11",
};
export const BETA_DOCUMENTS = DOCUMENT_VERSIONS.terms.startsWith("beta-");

// The website that hosts the documents (the web app's /terms and /privacy).
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
export const DOCUMENT_LINKS = { terms: `${WEB_URL}/terms`, privacy: `${WEB_URL}/privacy` };

// The welcome screen's background loop (stage 19, D099) comes from the website's
// /media, like the landing page's (EXPO_PUBLIC_MEDIA_URL if served elsewhere).
// EXPO_PUBLIC_WELCOME_VIDEO=off keeps only the still.
export const MEDIA_URL = (process.env.EXPO_PUBLIC_MEDIA_URL ?? WEB_URL).replace(/\/$/, "");
export const WELCOME_VIDEO = process.env.EXPO_PUBLIC_WELCOME_VIDEO !== "off";

// Invite-only sign-up (the beta, D096): the verify screen explains a missing code.
export const INVITE_ONLY = process.env.EXPO_PUBLIC_INVITE_ONLY === "1";

// The design-system gallery (`/design`): development and the e2e build only.
// It shows labelled samples, never people (D088).
export const DESIGN_GALLERY = __DEV__ || process.env.EXPO_PUBLIC_DESIGN_GALLERY === "1";
