import type { ConfigContext, ExpoConfig } from "expo/config";

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
  return {
    ...base,
    name: `${process.env.BRAND_NAME ?? "Haanji"} (beta)`,
    android: { ...base.android, package: process.env.ANDROID_PACKAGE ?? "dev.datingapp.beta" },
    extra: projectId ? { ...base.extra, eas: { projectId } } : base.extra,
  };
};
