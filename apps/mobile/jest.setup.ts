import { AccessibilityInfo } from "react-native";

// expo-secure-store has no native module under Jest: keep values in memory.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

// expo-crypto's native module is absent under Jest: Node's own UUIDs.
jest.mock("expo-crypto", () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>("node:crypto").randomUUID(),
}));

// Screen tests run with reduce motion on, so everything renders in its final state
// at once; src/ui/motion.test.tsx turns motion on and checks the animations (stage 19).
// The preset's AccessibilityInfo stand-in answers "off" by default.
AccessibilityInfo.isReduceMotionEnabled = jest.fn(async () => true);

// expo-notifications has no native module under Jest: a controllable stand-in (stage 16).
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: "undetermined" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[test-device-0001]" })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// A screen's top-bar actions render in place under Jest (no navigator; src/test/expoRouter.ts).
// Files that mock expo-router themselves win.
jest.mock("expo-router", () => require("@/test/expoRouter").expoRouterInPlace());
