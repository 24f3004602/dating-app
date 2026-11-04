// Ports and environment shared by the config, the setup and the specs.
import { resolve } from "node:path";

export const API_PORT = 8771;
export const WEB_PORT = 8772;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const RUN_DIR = resolve(__dirname, ".run");
export const WORKER_LOG = resolve(RUN_DIR, "worker.log");
export const PHOTO = resolve(RUN_DIR, "photo-with-gps.jpg");

// Overrides on top of apps/api/.env for the API and the worker of this run.
export function apiEnv(runId: string): Record<string, string> {
  return {
    CORS_ORIGINS: JSON.stringify([WEB_URL]),
    RATE_LIMIT_PREFIX: `rl-e2e-${runId}`,
    EMAIL_BACKEND: "console",
    STORAGE_BACKEND: "local",
    MEDIA_DIR: "var/media-e2e",
    LOG_JSON: "false",
    // No moderation queue until stage 11: approve uploads so the member can browse.
    PHOTO_REVIEW_REQUIRED: "false",
  };
}
