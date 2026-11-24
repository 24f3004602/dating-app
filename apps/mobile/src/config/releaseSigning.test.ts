// APK-SIGN-1 (stage 28c, D154): release builds are signed with the app's own key, never the
// debug keystore every React Native project shares. The fixture is the signing part of Expo's
// template (expo-template-bare-minimum 58.0.35, android/app/build.gradle; 0BSD licence).
import { signWithReleaseKey } from "../../app.config";

const TEMPLATE = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
`;

test("APK-SIGN-1: the release build type signs with the app's key from the environment; debug builds don't change", () => {
  const out = signWithReleaseKey(TEMPLATE);
  const release = out.slice(out.indexOf("        release {", out.indexOf("buildTypes")));
  expect(release).toContain("signingConfig signingConfigs.release");
  expect(release).not.toContain("signingConfig signingConfigs.debug");
  // The key comes from the build's environment, never from the repository.
  expect(out).toContain('        release {\n            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))');
  expect(out).toContain('storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")');
  expect(out).toContain('keyAlias System.getenv("ANDROID_KEY_ALIAS")');
  // The debug build keeps the debug key (development only).
  const debugType = out.slice(out.indexOf("buildTypes"), out.indexOf("        release {", out.indexOf("buildTypes")));
  expect(debugType).toContain("signingConfig signingConfigs.debug");
  expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
});

test("a changed template stops the build instead of signing with the debug key", () => {
  expect(() => signWithReleaseKey(TEMPLATE.replace("signingConfigs {", "signing {"))).toThrow(/has moved/);
  const noRelease = TEMPLATE.replace("            signingConfig signingConfigs.debug\n            def", "            def");
  expect(() => signWithReleaseKey(noRelease)).toThrow(/has moved/);
});
