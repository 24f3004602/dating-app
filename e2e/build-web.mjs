// Export the Expo web build pointed at the e2e API (before Playwright starts).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mobile = resolve(import.meta.dirname, "../apps/mobile");
const result = spawnSync("npx expo export --platform web", {
  cwd: mobile,
  shell: true,
  stdio: "inherit",
  env: { ...process.env, CI: "1", EXPO_PUBLIC_API_URL: "http://127.0.0.1:8771" },
});
process.exit(result.status ?? 1);
