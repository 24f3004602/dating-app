// Ports and environment shared by the config, the setup and the specs.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const API_PORT = 8771;
export const WEB_PORT = 8772;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
// The Next.js landing page and staff console (stage 14).
export const CONSOLE_PORT = 8773;
export const CONSOLE_URL = `http://127.0.0.1:${CONSOLE_PORT}`;
export const RUN_DIR = resolve(__dirname, ".run");
export const WORKER_LOG = resolve(RUN_DIR, "worker.log");
export const PHOTO = resolve(RUN_DIR, "photo-with-gps.jpg");

// Every run gets a fresh database of its own (recreated in global setup), so
// earlier runs' members never crowd today's introductions, and the
// developer's database is left alone.
export const E2E_DATABASE = "datingapp_e2e_test";
// The privacy notice version the API expects in this run, and the one the website's
// waitlist form sends (D101): the app's sign-up uses the same default.
export const E2E_PRIVACY_VERSION = "draft-2026-11";
// Sign in with Google (D134): a stand-in Web client, so the apps show the button and build
// Google's request. Google itself is never reached: the specs catch that page.
export const E2E_GOOGLE_CLIENT_ID = "123456789012-e2estandin.apps.googleusercontent.com";
// The website's contact (D150): a production website won't start without one. example.com is
// reserved (RFC 2606); nothing is ever sent to it.
export const E2E_CONTACT_EMAIL = "e2e-contact@example.com";

function dotenv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function databaseEnv(): Record<string, string> {
  const base = { ...dotenv(resolve(__dirname, "../apps/api/.env")), ...process.env };
  const out: Record<string, string> = {};
  for (const key of ["DATABASE_URL", "MIGRATIONS_DATABASE_URL"]) {
    const url = base[key];
    if (!url) throw new Error(`${key} is not set (apps/api/.env or the environment)`);
    out[key] = withDatabase(url, E2E_DATABASE);
  }
  return out;
}

// Overrides on top of apps/api/.env for the API and the worker of this run.
export function apiEnv(runId: string): Record<string, string> {
  return {
    ...databaseEnv(),
    CORS_ORIGINS: JSON.stringify([WEB_URL]),
    PRIVACY_VERSION: E2E_PRIVACY_VERSION,
    RATE_LIMIT_PREFIX: `rl-e2e-${runId}`,
    EMAIL_BACKEND: "console",
    STORAGE_BACKEND: "local",
    MEDIA_DIR: "var/media-e2e",
    LOG_JSON: "false",
    // No moderation queue until stage 11: approve uploads so the member can browse.
    PHOTO_REVIEW_REQUIRED: "false",
    // Live calls (stage 23, D123) between two browsers on this machine: no relay here.
    // Refused on any server people use, where calls go only through the relay.
    CALLS_ICE: "direct",
    // The Plus pass (D127): paid by UPI to a labelled test payee; nobody pays anything in
    // the e2e run (a member only sends a made-up reference, and an admin decides).
    PAYMENTS_BACKEND: "upi",
    PAYMENTS_LIVE: "true",
    UPI_PAYEE_VPA: "e2e.payee@example",
    UPI_PAYEE_NAME: "E2E Payee",
    GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "e2e-stand-in-not-a-secret",
    GOOGLE_REDIRECT_URI: `${WEB_URL}/auth/google`,
  };
}
