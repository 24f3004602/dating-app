import { defineConfig } from "@playwright/test";

import {
  API_PORT,
  API_URL,
  apiEnv,
  CONSOLE_PORT,
  CONSOLE_URL,
  E2E_CONTACT_EMAIL,
  E2E_OPERATOR_NAME,
  E2E_PRIVACY_VERSION,
  WEB_PORT,
  WEB_URL,
} from "./env";

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
    // Stage 21a: the landing page's 3D map needs WebGL; CI's Chrome has no GPU, so it
    // gets the software renderer (SwiftShader), which Chrome now only enables on request.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
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
      // APP_URL: the landing page's buttons open the member app (D133), here its web build.
      // CONTACT_EMAIL: a production website needs one (D150); a reserved, undeliverable domain.
      // OPERATOR_NAME: and the grievance officer's name (D155).
      env: {
        ...process.env,
        API_URL,
        APP_URL: WEB_URL,
        CONTACT_EMAIL: E2E_CONTACT_EMAIL,
        OPERATOR_NAME: E2E_OPERATOR_NAME,
        PRIVACY_VERSION: E2E_PRIVACY_VERSION,
      } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
