/**
 * Push on this phone (stage 16, D093). Asked for only when the member turns it
 * on, never at sign-in. The server ties the token to this session, so signing
 * out stops pushes even if this phone is offline.
 *
 * What it needs that doesn't exist yet (owner setup): an EAS project ID in the
 * app config, Firebase credentials for Android and an Apple developer account
 * for iOS. Until then `enablePush` answers "not_configured". Expo push doesn't
 * exist on the web at all.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { type Api, unwrap } from "@/api/client";

export type PushResult = "enabled" | "unsupported" | "not_configured" | "denied";

export function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function enablePush(api: Api): Promise<PushResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unsupported";
  const id = projectId();
  if (!id) return "not_configured";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notifications",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denied";
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  await unwrap(api.PUT("/v1/me/push-device", { body: { token, platform: Platform.OS } }));
  return "enabled";
}

/** Where a tapped push leads. Pushes carry only a kind: no names, text or IDs. */
export function routeFor(data: unknown): "/matches" | "/likes" | "/safety" | null {
  const kind = typeof data === "object" && data !== null ? (data as { kind?: unknown }).kind : undefined;
  if (kind === "match" || kind === "message") return "/matches";
  if (kind === "like") return "/likes";
  if (kind === "notice") return "/safety";
  return null;
}
