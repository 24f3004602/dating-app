/**
 * Who gets the welcome's 3D map (stage 21b, D122). Reduce motion (the phone's setting or
 * the browser's), checked by the caller with every other animation, keeps the flat map;
 * so does EXPO_PUBLIC_WELCOME_3D=off, for everyone (config.ts). On a phone that's all: the scene
 * draws with the phone's own GL and falls back to the flat map if that fails. In a
 * browser (the web build) the same gates as the website's hero (D119): the data saver, a
 * 2G connection, forced colours, under 4 GB of memory or no WebGL 2 keep the flat map.
 * Pure, so it's unit-tested (sceneGate.test.ts).
 */
import { Platform } from "react-native";

export type Viewing = {
  saveData: boolean;
  /** The Network Information API's estimate ("4g", "3g", "2g", "slow-2g"), if the browser gives one. */
  connection: string | null;
  forcedColors: boolean;
  /** Gigabytes, rounded down by the browser, if it says. */
  memory: number | null;
  webgl2: boolean;
};

const TOO_SLOW = new Set(["slow-2g", "2g"]);

/** `viewing` is null on a phone (nothing to ask but reduce motion). */
export function chooseWelcomeScene(viewing: Viewing | null, enabled: boolean): boolean {
  if (!enabled) return false;
  if (viewing === null) return true;
  if (viewing.saveData || viewing.forcedColors || !viewing.webgl2) return false;
  if (viewing.connection !== null && TOO_SLOW.has(viewing.connection)) return false;
  return viewing.memory === null || viewing.memory >= 4;
}

type Browser = {
  navigator: { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  matchMedia?: (query: string) => { matches: boolean };
  document: { createElement: (tag: "canvas") => { getContext: (kind: "webgl2") => unknown } };
};

/** What the browser says (null on a phone). A canvas that throws means no WebGL 2; the probe gives its context back. */
export function readViewing(win: Browser | undefined = Platform.OS === "web" && typeof window !== "undefined" ? (window as unknown as Browser) : undefined): Viewing | null {
  if (!win) return null;
  const connection = win.navigator.connection;
  let webgl2 = false;
  try {
    const gl = win.document.createElement("canvas").getContext("webgl2") as { getExtension?: (name: string) => { loseContext?: () => void } | null } | null;
    webgl2 = !!gl;
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  } catch {
    webgl2 = false;
  }
  return {
    saveData: connection?.saveData === true,
    connection: connection?.effectiveType ?? null,
    forcedColors: win.matchMedia?.("(forced-colors: active)").matches === true,
    memory: typeof win.navigator.deviceMemory === "number" ? win.navigator.deviceMemory : null,
    webgl2,
  };
}
