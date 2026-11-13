/**
 * Whether the first screen's route map comes alive in 3D (stage 21a, D119) or stays the
 * flat drawing. The flat map is always the first picture and the fallback; the 3D scene
 * costs about 1 MB more, so it never loads for a visitor who asks for less: reduced
 * motion, the data saver, a slow connection, forced colours, a low-memory device, no
 * WebGL 2, or HERO_3D=off for everyone. Pure, so it's unit-tested (tests/heroScene.test.mjs).
 */
import { SLOW } from "./heroVideo.ts";

export type SceneViewing = {
  reducedMotion: boolean;
  /** The browser's data saver (navigator.connection.saveData). */
  saveData: boolean;
  /** navigator.connection.effectiveType, where the browser reports it. */
  effectiveType?: string;
  /** Windows high contrast and the like: the flat map follows the system colours. */
  forcedColors: boolean;
  /** navigator.deviceMemory in GB, where the browser reports it (Chromium rounds it). */
  deviceMemory?: number;
  webgl2: boolean;
};

export function chooseHeroScene(viewing: SceneViewing, enabled: boolean): "3d" | "flat" {
  if (!enabled || viewing.reducedMotion || viewing.saveData || viewing.forcedColors) return "flat";
  if (viewing.effectiveType && SLOW.has(viewing.effectiveType)) return "flat";
  if (viewing.deviceMemory !== undefined && viewing.deviceMemory < 4) return "flat";
  return viewing.webgl2 ? "3d" : "flat";
}

/** HERO_3D=off turns the scene off for every visitor (read per request, like HERO_VIDEO). */
export function heroSceneEnabled(env: Record<string, string | undefined>): boolean {
  return (env.HERO_3D ?? "").trim().toLowerCase() !== "off";
}

type Connection = { saveData?: boolean; effectiveType?: string };

/** The browser's answers, read once when the page has loaded. */
export function readViewing(win: Window): SceneViewing {
  const nav = win.navigator as Navigator & { connection?: Connection; deviceMemory?: number };
  let webgl2 = false;
  try {
    // A throwaway canvas: is WebGL 2 there at all (three.js needs it)?
    const gl = win.document.createElement("canvas").getContext("webgl2");
    webgl2 = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  return {
    reducedMotion: win.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType,
    forcedColors: win.matchMedia("(forced-colors: active)").matches,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    webgl2,
  };
}
