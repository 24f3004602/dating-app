// APK-VER-1..2 (stage 28d): every Android build gets its own, growing number, so an update
// installs over the last one (Android refuses a lower versionCode) and Google Play takes each upload.
import type { ConfigContext, ExpoConfig } from "expo/config";

import appConfig, { buildVersion } from "../../app.config";

const BETA = {
  APP_VARIANT: "beta",
  EXPO_PUBLIC_API_URL: "https://api.kinaara.online",
  EXPO_PUBLIC_WEB_URL: "https://kinaara.online",
  EXPO_PUBLIC_TERMS_VERSION: "beta-2026-11-25",
  EXPO_PUBLIC_PRIVACY_VERSION: "beta-2026-11-25",
  ANDROID_PACKAGE: "online.kinaara.app",
};
const KEYS = [...Object.keys(BETA), "ANDROID_VERSION_CODE", "ANDROID_KEYSTORE_PATH"];

function reset(): void {
  for (const key of KEYS) delete process.env[key];
}
afterEach(reset);

function configure(env: Record<string, string>): ExpoConfig {
  reset();
  Object.assign(process.env, env);
  const config = { name: "Kinaara", slug: "kinaara", version: "0.1.0", android: { package: "dev.datingapp" } };
  return appConfig({ config } as unknown as ConfigContext);
}

test("APK-VER-1: the build number becomes the versionCode and the version's last part", () => {
  expect(buildVersion("0.1.0", "17")).toEqual({ version: "0.1.17", versionCode: 17 });
  expect(buildVersion("2.3.9", "2100000000")).toEqual({ version: "2.3.2100000000", versionCode: 2_100_000_000 });
  // No build number (local and web builds): nothing changes.
  expect(buildVersion("0.1.0", undefined)).toEqual({ version: "0.1.0" });
  expect(buildVersion("0.1.0", "")).toEqual({ version: "0.1.0" });
  // Never a number Android or Play would refuse, or one that isn't what it looks like.
  for (const bad of ["0", "017", "-1", "1.5", "17 ", "abc", "2100000001", "99999999999"]) {
    expect(() => buildVersion("0.1.0", bad)).toThrow(/ANDROID_VERSION_CODE must be a whole number/);
  }
  expect(() => buildVersion("0.1", "17")).toThrow(/app\.json's version must look like 0\.1\.0/);
  // app.json's own version has the shape the numbering needs.
  const { expo } = require("../../app.json") as { expo: { version: string } };
  expect(buildVersion(expo.version, "17").version).toMatch(/^\d+\.\d+\.17$/);
});

test("APK-VER-2: the beta build carries it; without one, or outside the beta, nothing changes", () => {
  const numbered = configure({ ...BETA, ANDROID_VERSION_CODE: "17" });
  expect(numbered.version).toBe("0.1.17");
  expect(numbered.android).toEqual({ package: "online.kinaara.app", versionCode: 17 });

  const plain = configure(BETA);
  expect(plain.version).toBe("0.1.0");
  expect(plain.android).toEqual({ package: "online.kinaara.app" });

  const development = configure({ ANDROID_VERSION_CODE: "17" });
  expect(development.version).toBe("0.1.0");
  expect(development.android).toEqual({ package: "dev.datingapp" });

  expect(() => configure({ ...BETA, ANDROID_VERSION_CODE: "0" })).toThrow(/ANDROID_VERSION_CODE/);
});
