/**
 * What the tour remembers, on this device only (D136): that the offer was answered, and
 * whether to read aloud. Nothing about the account and nothing sent anywhere; signing out
 * keeps both, as they say nothing about who used the app. The phone app keeps them with
 * expo-secure-store; the web app in the browser's local storage (neither is a secret).
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const OFFERED = "tour.offered.v1";
const VOICE = "tour.voice";

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // storage switched off in the browser: the tour simply asks again
  }
}

async function read(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return browserStorage()?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") browserStorage()?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Not remembered: the offer may come again, which does no harm.
  }
}

export const tourMemory = {
  /** The offer was answered on this device (started or "Not now"). */
  offered: async (): Promise<boolean> => (await read(OFFERED)) === "yes",
  markOffered: (): Promise<void> => write(OFFERED, "yes"),
  /** true or false once chosen; null: never chosen here. */
  voice: async (): Promise<boolean | null> => {
    const value = await read(VOICE);
    return value === "on" ? true : value === "off" ? false : null;
  },
  setVoice: (on: boolean): Promise<void> => write(VOICE, on ? "on" : "off"),
};
