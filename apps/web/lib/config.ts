import "server-only";

/**
 * Server-side settings. Nothing here reaches the browser (no NEXT_PUBLIC_ names).
 * - API_URL: how this server reaches the API.
 * - API_PUBLIC_URL: the API origin browsers load signed photo URLs from (CSP img-src).
 */
export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? API_URL).replace(/\/$/, "");
export const BRAND = process.env.BRAND_NAME ?? "Haanji";
// The member app on the web (the Expo web build, app.<domain>): the landing page's
// buttons open its sign-up and sign-in screens (D133).
export const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
// This site's own public address (https://<domain>), for links that must name it, such as
// security.txt's Canonical line (D145). Unset: those lines are left out.
export const SITE_URL = process.env.SITE_URL?.trim().replace(/\/$/, "") || null;
// The name in Devanagari, shown beside the Latin one when set (D101). Its letters must
// be in scripts/devanagari-text.txt (the font is subset to that text).
export const BRAND_DEVANAGARI = process.env.BRAND_NAME_DEVANAGARI?.trim() || null;

// `__Host-` cookies are Secure, Path=/ and host-only: no subdomain can set or read them.
export const STAFF_COOKIE = "__Host-staff";
export const CHALLENGE_COOKIE = "__Host-staff-step";
