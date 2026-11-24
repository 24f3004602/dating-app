import type { ConfigContext, ExpoConfig } from "expo/config";
import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

/**
 * Build variants on top of app.json (D096). The beta build for testers' Android
 * phones gets its settings from the "beta" profile in eas.json; everything else
 * (development, the web export, the e2e build) uses app.json unchanged.
 */
// Google's own test app IDs (Google Mobile Ads' docs). The SDK closes a release build at launch
// without an app ID, so every build has one: the owner's real ID only for live ads (D137).
const TEST_ADMOB_APP = { android: "ca-app-pub-3940256099942544~3347511713", ios: "ca-app-pub-3940256099942544~1458002511" };
const APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;
const UNIT_ID = /^ca-app-pub-\d{16}\/\d{10}$/;

/**
 * In-app ads (D137): EXPO_PUBLIC_ADS is "off" (the default), "test" or "live". Live needs the
 * owner's AdMob app ID (ADMOB_ANDROID_APP_ID) and both ad units, none of them Google's test ones.
 * App measurement waits until the app starts the SDK, which it does only for members who see ads.
 */
function adsPlugin(): [string, Record<string, unknown>] {
  const mode = process.env.EXPO_PUBLIC_ADS ?? "off";
  if (!["off", "test", "live"].includes(mode)) throw new Error('EXPO_PUBLIC_ADS must be "off", "test" or "live".');
  const appId = process.env.ADMOB_ANDROID_APP_ID?.trim() || TEST_ADMOB_APP.android;
  if (!APP_ID.test(appId)) throw new Error("ADMOB_ANDROID_APP_ID must look like ca-app-pub-0000000000000000~0000000000.");
  if (mode === "live") {
    const units = [process.env.EXPO_PUBLIC_ADMOB_BANNER_ID, process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID];
    if (appId === TEST_ADMOB_APP.android || units.some((u) => !u || !UNIT_ID.test(u) || u.includes("3940256099942544"))) {
      throw new Error("Live ads need the owner's AdMob app ID and both ad unit IDs (replica/deploy.md, In-app ads).");
    }
  }
  return ["react-native-google-mobile-ads", { androidAppId: appId, iosAppId: TEST_ADMOB_APP.ios, delayAppMeasurementInit: true }];
}

/**
 * The app's own release key (stage 28c, D154). Expo's template signs release builds with the
 * debug keystore every React Native project shares, so anyone could sign an "update" Android
 * would accept. When ANDROID_KEYSTORE_PATH is set (the android-apk workflow, from the
 * android-release environment's secrets), release builds are signed with the app's key instead;
 * the workflow then checks the APK's certificate. Each anchor is checked: a changed template
 * fails the build rather than quietly signing with the debug key.
 */
export function signWithReleaseKey(gradle: string): string {
  const signing = /signingConfigs \{\n(\s+)debug \{/;
  const releaseType = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!signing.test(gradle) || !releaseType.test(gradle)) {
    throw new Error("Release signing: the template's signingConfigs or release build type has moved.");
  }
  return gradle
    .replace(
      signing,
      [
        "signingConfigs {",
        "$1release {",
        '$1    storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))',
        '$1    storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")',
        '$1    keyAlias System.getenv("ANDROID_KEY_ALIAS")',
        '$1    keyPassword System.getenv("ANDROID_KEYSTORE_PASSWORD")',
        "$1}",
        "$1debug {",
      ].join("\n"),
    )
    .replace(releaseType, "$1signingConfig signingConfigs.release");
}

export const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = signWithReleaseKey(mod.modResults.contents);
    return mod;
  });

// Google Play's highest versionCode (developer.android.com/studio/publish/versioning, read 2026-11-24).
const MAX_VERSION_CODE = 2_100_000_000;

/**
 * Each Android build's number (stage 28d): ANDROID_VERSION_CODE, the android-apk workflow's run
 * number. Android refuses to install a lower versionCode over a higher one, and Play needs every
 * upload's to be higher than the last, so each build gets its own; the version members see becomes
 * app.json's major.minor and the build, e.g. 0.1.17. Unset (local and web builds), nothing changes.
 */
export function buildVersion(version: string, build: string | undefined): { version: string; versionCode?: number } {
  if (build === undefined || build === "") return { version };
  const parts = /^(\d+)\.(\d+)\.\d+$/.exec(version);
  if (!/^[1-9]\d{0,9}$/.test(build) || Number(build) > MAX_VERSION_CODE) {
    throw new Error(`ANDROID_VERSION_CODE must be a whole number from 1 to ${MAX_VERSION_CODE}.`);
  }
  if (!parts) throw new Error(`app.json's version must look like 0.1.0, not "${version}".`);
  return { version: `${parts[1]}.${parts[2]}.${build}`, versionCode: Number(build) };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const configured = config as ExpoConfig;
  const base: ExpoConfig = { ...configured, plugins: [...(configured.plugins ?? []), adsPlugin()] };
  if (process.env.APP_VARIANT !== "beta") return base;

  const required = ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_WEB_URL", "EXPO_PUBLIC_TERMS_VERSION", "EXPO_PUBLIC_PRIVACY_VERSION"];
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.includes("example.")) {
      throw new Error(`The beta build needs ${key} set to the beta server's value (see replica/deploy.md).`);
    }
    if (key.endsWith("_URL") && !value.startsWith("https://")) {
      throw new Error(`${key} must be an https URL for the beta build.`);
    }
  }
  // The Android build needs the EAS project ID (EAS refuses to build without it,
  // and push uses it); the web build for the beta server doesn't.
  const projectId = process.env.EAS_PROJECT_ID;
  if (projectId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId)) {
    throw new Error("EAS_PROJECT_ID must be the project ID from `eas init` (replica/deploy.md).");
  }
  const { version, versionCode } = buildVersion(base.version ?? "0.1.0", process.env.ANDROID_VERSION_CODE);
  const beta: ExpoConfig = {
    ...base,
    name: `${process.env.BRAND_NAME ?? "Haanji"} (beta)`,
    version,
    android: {
      ...base.android,
      package: process.env.ANDROID_PACKAGE ?? "dev.datingapp.beta",
      ...(versionCode === undefined ? {} : { versionCode }),
    },
    extra: projectId ? { ...base.extra, eas: { projectId } } : base.extra,
  };
  return process.env.ANDROID_KEYSTORE_PATH ? withReleaseSigning(beta) : beta;
};
