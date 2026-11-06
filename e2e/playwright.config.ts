import { defineConfig } from "@playwright/test";

import { API_PORT, API_URL, apiEnv, CONSOLE_PORT, CONSOLE_URL, WEB_PORT, WEB_URL } from "./env";

const runId = process.env.E2E_RUN_ID ?? Date.now().toString(36);
process.env.E2E_RUN_ID = runId;

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: WEB_URL,
    channel: "chrome", // the installed Chrome: no browser download
    headless: true,
    viewport: { width: 390, height: 844 },
    // Stage 19: the suite runs still, so no check races an animation; motion.spec.ts turns motion on.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `uv run datingapp-api serve --port ${API_PORT}`,
      cwd: "../apps/api",
      url: `${API_URL}/healthz`,
      env: { ...process.env, ...apiEnv(runId) } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: `node serve-static.mjs ../apps/mobile/dist ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
    },
    {
      // The Next.js landing page and staff console, production build.
      command: `npx next start -p ${CONSOLE_PORT} -H 127.0.0.1`,
      cwd: "../apps/web",
      url: CONSOLE_URL,
      env: { ...process.env, API_URL } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
