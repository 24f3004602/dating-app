// The API base URL. Set EXPO_PUBLIC_API_URL for devices on the LAN; the
// default suits the web build and emulators that forward localhost.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// Versions of the documents shown at sign-up. The API refuses a mismatch with
// `consent_required` and the versions it expects; production needs final,
// legally reviewed versions (D044).
export const DOCUMENT_VERSIONS = { terms: "draft-2026-11", privacy: "draft-2026-11" } as const;
