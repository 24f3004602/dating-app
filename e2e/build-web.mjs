// Export the Expo web build pointed at the e2e API (before Playwright starts).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mobile = resolve(import.meta.dirname, "../apps/mobile");
const result = spawnSync("npx expo export --platform web", {
  cwd: mobile,
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    CI: "1",
    EXPO_PUBLIC_API_URL: "http://127.0.0.1:8771",
    // The website (next start in the e2e): the documents and the welcome loop's /media.
    EXPO_PUBLIC_WEB_URL: "http://127.0.0.1:8773",
    EXPO_PUBLIC_DESIGN_GALLERY: "1",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The landing page and staff console, built for production (next start serves it).
const web = spawnSync("npm run build -w @datingapp/web", {
  cwd: resolve(import.meta.dirname, ".."),
  shell: true,
  stdio: "inherit",
  env: { ...process.env, API_URL: "http://127.0.0.1:8771" },
});
process.exit(web.status ?? 1);
