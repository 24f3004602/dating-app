"use client";

import { Component, type ComponentType, type ReactNode, useEffect, useState } from "react";

import { chooseHeroScene, readViewing } from "@/lib/heroScene";
import { COMPACT, TALL } from "@/lib/routeMap";

import type { SceneColors, SceneProps } from "./hero3d/InterchangeScene";
import styles from "./landing.module.css";

type Phase = "flat" | "loading" | "3d";

/**
 * The first screen's map (stage 20d) and, for visitors who haven't asked for less, its
 * 3D scene (stage 21a, D119). The flat SVG is server-rendered and stays the accessible
 * picture; the scene is decoration (aria-hidden), loaded once the page is idle and shown
 * only when its first frames are drawn, which match the flat map line for line. Any
 * failure, a lost GPU context or reduced motion switched on brings the flat map back.
 *
 * data-scene on each map box: "flat", "loading" or "3d"; data-settled="true" once the
 * rings are at rest (the e2e suite waits on both).
 */
export function HeroMap({ scene, compact, tall }: { scene: boolean; compact: ReactNode; tall: ReactNode }) {
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  const [phase, setPhase] = useState<Phase>("flat");
  const [wide, setWide] = useState(false);
  const [settled, setSettled] = useState(false);
  const [colors, setColors] = useState<SceneColors | null>(null);
  const [tilt, setTilt] = useState(false);

  useEffect(() => {
    if (!scene || chooseHeroScene(readViewing(window), true) !== "3d") return;
    let cancelled = false;
    const wideQuery = window.matchMedia("(min-width: 64rem)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onWide = () => {
      setWide(wideQuery.matches);
      // The other map box gets its own scene: shown again once it has drawn.
      setPhase((p) => (p === "3d" ? "loading" : p));
    };
    const onMotion = () => {
      if (!motionQuery.matches) return;
      cancelled = true;
      setScene(null);
      setPhase("flat");
    };
    setWide(wideQuery.matches);
    setTilt(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    setColors(readColors(document.documentElement));
    setPhase("loading");
    wideQuery.addEventListener("change", onWide);
    motionQuery.addEventListener("change", onMotion);
    const load = () => {
      import("./hero3d/InterchangeScene").then(
        (m) => {
          if (!cancelled) setScene(() => m.InterchangeScene);
        },
        () => {
          if (!cancelled) setPhase("flat");
        },
      );
    };
    // Like the loop video: only once the page has settled in.
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(load, { timeout: 2000 }) : window.setTimeout(load, 800);
    return () => {
      cancelled = true;
      wideQuery.removeEventListener("change", onWide);
      motionQuery.removeEventListener("change", onMotion);
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [scene]);

  const flat = () => {
    setScene(null);
    setPhase("flat");
  };
  const overlay = (here: boolean, map: typeof COMPACT) =>
    here && Scene && colors ? (
      <div className={styles.scene} aria-hidden="true">
        <SceneBoundary onError={flat}>
          <Scene
            map={map}
            colors={colors}
            still={settled}
            tilt={tilt}
            onReady={() => setPhase("3d")}
            onSettled={() => setSettled(true)}
            onLost={flat}
          />
        </SceneBoundary>
      </div>
    ) : null;
  const state = (here: boolean) => ({ "data-scene": here ? phase : "flat", "data-settled": here && settled ? "true" : undefined });

  return (
    <>
      <div className={[styles.mapBox, styles.mapCompact].join(" ")} {...state(!wide)}>
        {compact}
        {overlay(!wide, COMPACT)}
      </div>
      <div className={[styles.mapBox, styles.mapTall].join(" ")} {...state(wide)}>
        {tall}
        {overlay(wide, TALL)}
      </div>
    </>
  );
}

/** The scene's colours from the page's own: its ground and the map's tokens. */
function readColors(root: HTMLElement): SceneColors {
  const css = getComputedStyle(root);
  let ground = "#ffffff";
  for (let el: HTMLElement | null = document.querySelector("main"); el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0")) {
      ground = bg;
      break;
    }
  }
  return {
    ground,
    teal: css.getPropertyValue("--color-accent").trim(),
    marigold: css.getPropertyValue("--color-highlight").trim(),
    graphite: css.getPropertyValue("--color-text").trim(),
    white: "#ffffff",
  };
}

/** A scene that throws (no WebGL, the physics engine refused) leaves the flat map. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
