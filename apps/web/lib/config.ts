import "server-only";

/**
 * Server-side settings. Nothing here reaches the browser (no NEXT_PUBLIC_ names).
 * - API_URL: how this server reaches the API.
 * - API_PUBLIC_URL: the API origin browsers load signed photo URLs from (CSP img-src).
 */
export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? API_URL).replace(/\/$/, "");
export const BRAND = process.env.BRAND_NAME ?? "Haanji";

// `__Host-` cookies are Secure, Path=/ and host-only: no subdomain can set or read them.
export const STAFF_COOKIE = "__Host-staff";
export const CHALLENGE_COOKIE = "__Host-staff-step";
