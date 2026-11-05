import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { enablePush, routeFor } from "@/notifications/push";
import { fakeApi } from "@/test/fakeApi";

// A plain object, so tests can set the app config (the real one exposes getters).
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} }, easConfig: undefined } }));

const setProject = (id: string | undefined) => {
  (Constants as { expoConfig: unknown }).expoConfig = id ? { extra: { eas: { projectId: id } } } : { extra: {} };
  (Constants as { easConfig: unknown }).easConfig = undefined;
};
afterEach(() => {
  jest.clearAllMocks();
  Platform.OS = "ios";
});

test("without an EAS project, nothing is asked and nothing is sent", async () => {
  setProject(undefined);
  const { api, calls } = fakeApi({});
  expect(await enablePush(api)).toBe("not_configured");
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});

test("on the web, push isn't offered", async () => {
  setProject("abc");
  Platform.OS = "web";
  const { api } = fakeApi({});
  expect(await enablePush(api)).toBe("unsupported");
});

test("permission refused: no token, nothing registered", async () => {
  setProject("abc");
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ status: "denied" } as never);
  const { api, calls } = fakeApi({});
  expect(await enablePush(api)).toBe("denied");
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});

test("granted on Android: a channel, the project's token, registered for this session", async () => {
  setProject("abc");
  Platform.OS = "android";
  const { api, calls } = fakeApi({ "PUT /v1/me/push-device": () => ({ status: 204 }) });
  expect(await enablePush(api)).toBe("enabled");
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "abc" });
  expect(calls[0]?.body).toEqual({ token: "ExponentPushToken[test-device-0001]", platform: "android" });
});

test("a tapped push opens a list, never a person: pushes carry only a kind", () => {
  expect(routeFor({ kind: "message" })).toBe("/matches");
  expect(routeFor({ kind: "match" })).toBe("/matches");
  expect(routeFor({ kind: "like" })).toBe("/likes");
  expect(routeFor({ kind: "notice" })).toBe("/safety");
  expect(routeFor({ kind: "other" })).toBeNull();
  expect(routeFor(null)).toBeNull();
});
