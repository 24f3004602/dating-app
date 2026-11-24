import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "session_token";

/**
 * Native: the OS keystore via expo-secure-store (threat model T03).
 * Web: nothing is kept on the page. The session is the API's HttpOnly cookie (D152), which no
 * script can read; a token handed to the web app anyway (an older API) stays in memory only, as
 * D058 had it, and is never written to localStorage.
 */
let webToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") return webToken;
  return SecureStore.getItemAsync(KEY);
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    webToken = token;
    return;
  }
  await SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    webToken = null;
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
