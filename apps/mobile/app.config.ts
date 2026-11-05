import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Build variants on top of app.json (D096). The beta build for testers' Android
 * phones gets its settings from the "beta" profile in eas.json; everything else
 * (development, the web export, the e2e build) uses app.json unchanged.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
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
  const projectId = process.env.EAS_PROJECT_ID;
  if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId)) {
    throw new Error("The beta build needs EAS_PROJECT_ID: the project ID from `eas init` (replica/deploy.md).");
  }
  return {
    ...base,
    name: `${process.env.BRAND_NAME ?? "Haanji"} (beta)`,
    android: { ...base.android, package: process.env.ANDROID_PACKAGE ?? "dev.datingapp.beta" },
    extra: { ...base.extra, eas: { projectId } },
  };
};
