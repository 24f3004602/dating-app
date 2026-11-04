import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "session_token";

/**
 * Native: the OS keystore via expo-secure-store (threat model T03).
 * Web: memory only, never localStorage (readable by any injected script),
 * so a page reload means signing in again.
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
