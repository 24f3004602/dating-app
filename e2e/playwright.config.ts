import { defineConfig } from "@playwright/test";

import { API_PORT, API_URL, apiEnv, WEB_PORT, WEB_URL } from "./env";

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
  ],
});
