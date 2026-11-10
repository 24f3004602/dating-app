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
  };
}
