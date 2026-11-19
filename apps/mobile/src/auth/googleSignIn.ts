/**
 * Sign in with Google on the phone (D134): Google's own account chooser, through
 * @react-native-google-signin/google-signin. It asks for an ID token made for our Web
 * client ID, which the API checks against Google's keys. Only email and profile are
 * asked for (the library's default), with no offline access, and nothing from Google
 * stays on the phone: the app signs out of Google straight after.
 */
import { TurboModuleRegistry } from "react-native";

import type { GoogleOutcome, GoogleRequest, GoogleReturn } from "@/auth/googleTypes";

type Library = typeof import("@react-native-google-signin/google-signin");
let loaded: Library | null | undefined;

/**
 * The library, or null where its native part isn't in the build (builds before D134,
 * Expo Go, tests). Importing it there throws while the module loads, which a release
 * build treats as fatal, so the native part is looked up first.
 */
function library(): Library | null {
  if (loaded === undefined) {
    loaded = null;
    if (TurboModuleRegistry.get("RNGoogleSignin")) {
      try {
        loaded = require("@react-native-google-signin/google-signin") as Library;
      } catch {
        loaded = null;
      }
    }
  }
  return loaded;
}

export function googleSupported(): boolean {
  return library() !== null;
}

export async function startGoogleSignIn(request: GoogleRequest): Promise<GoogleOutcome> {
  const lib = library();
  if (!lib) return { kind: "unavailable" };
  const { GoogleSignin, isErrorWithCode, statusCodes } = lib;
  GoogleSignin.configure({ webClientId: request.clientId });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const answer = await GoogleSignin.signIn();
    if (answer.type !== "success") return { kind: "cancelled" };
    return answer.data.idToken ? { kind: "token", idToken: answer.data.idToken } : { kind: "failed" };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) return { kind: "cancelled" };
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: "unavailable" };
    }
    return { kind: "failed" };
  } finally {
    // The next tap shows Google's chooser again (a shared phone, another account).
    await GoogleSignin.signOut().catch(() => null);
  }
}

/** Only the web app comes back from Google's page; the phone app has its answer in place. */
export function takeGoogleReturn(_query: { code?: string; state?: string; error?: string }): GoogleReturn {
  return { kind: "failed", from: "/welcome" };
}
