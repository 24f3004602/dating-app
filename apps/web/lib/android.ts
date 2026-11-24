/**
 * The Android app's download (stage 28c, D154): until it is on Google Play, the APK is the latest
 * GitHub Release of this repository, which the android-apk workflow publishes as kinaara.apk.
 * Every build is signed with the app's own key; its certificate's SHA-256 is below, so anyone can
 * check a download is ours, and Android refuses an "update" signed with any other key.
 * No "server-only": Node's test runner loads this file directly.
 */
const REPOSITORY = "https://github.com/24f3004602/dating-app";

export const APK_FILE = "kinaara.apk";
export const APK_URL = `${REPOSITORY}/releases/latest/download/${APK_FILE}`;
export const RELEASES_URL = `${REPOSITORY}/releases/latest`;
export const CERT_SHA256 =
  "67:4F:68:41:C1:7D:9C:6F:6E:5D:1F:0D:F4:DC:70:D5:F9:2C:61:F3:F3:A1:35:2F:49:33:E8:0A:AF:72:F2:C4";
/** Expo SDK 58's lowest Android (API 24), on 64-bit phones: the build is arm64 only. */
export const ANDROID_MIN = "Android 7.0 or later, on a 64-bit phone";
