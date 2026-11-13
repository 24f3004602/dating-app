/**
 * The welcome map's 3D scene, when it's wanted (stage 21b, D122). The flat map drawn
 * with views is the picture and the accessible image; this lays the 3D scene over it,
 * hidden, once the screen is idle; shows it when its first two frames (which match the
 * flat map) are drawn; and takes it away again if anything fails, so the flat map is
 * always there underneath. It's decoration: hidden from screen readers.
 *
 * Reduce motion (or not knowing it yet), EXPO_PUBLIC_WELCOME_3D=off and, in a browser,
 * the website's gates keep the flat map (sceneGate.ts).
 */
import type { MapLayout } from "@datingapp/interchange/map";
import { Component, type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { WELCOME_3D } from "@/config";
import { motion } from "@/theme/tokens";
import { useMotionSetting } from "@/ui/motion";
import { chooseWelcomeScene, readViewing } from "@/ui/sceneGate";
import type { SceneProps } from "@/ui/welcome3d/InterchangeScene";

/** What the map shows: its own rings, or the scene's (whose rings fade in over them). */
export type ScenePhase = "flat" | "3d";

/** Loads the scene's code (three.js and React Three Fiber) only when it's wanted. Tests replace it. */
export const sceneLoader = {
  load: (): Promise<ComponentType<SceneProps>> => import("@/ui/welcome3d/InterchangeScene").then((m) => m.InterchangeScene),
};

export function Welcome3D({ map, onPhase }: { map: MapLayout; onPhase: (phase: ScenePhase) => void }) {
  const reduce = useMotionSetting();
  const [viewing] = useState(readViewing);
  const allowed = reduce === false && chooseWelcomeScene(viewing, WELCOME_3D);
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  const [failed, setFailed] = useState(false);
  // The width the scene last drew its first frames at: shown only while it still matches.
  const [readyAt, setReadyAt] = useState<number | null>(null);
  // It plays once; after that (a new width) it starts at rest.
  const played = useRef(false);
  const [settled, setSettled] = useState(false);
  const report = useRef(onPhase);
  useEffect(() => {
    report.current = onPhase;
  });

  useEffect(() => {
    if (!allowed || Scene || failed) return;
    let gone = false;
    let cancel = () => {};
    // Not before the flat rings have met (their hero entrance), then when the screen is idle.
    const wait = setTimeout(() => {
      cancel = whenIdle(() => {
        sceneLoader.load().then(
          (loaded) => !gone && setScene(() => loaded),
          () => !gone && setFailed(true),
        );
      });
    }, motion.duration.hero);
    return () => {
      gone = true;
      clearTimeout(wait);
      cancel();
    };
  }, [allowed, Scene, failed]);

  const live = allowed && !failed && Scene !== null;
  const shown = live && readyAt === map.width;
  useEffect(() => {
    report.current(shown ? "3d" : "flat");
  }, [shown]);

  if (!live) return null;
  return (
    <SceneBoundary onError={() => setFailed(true)}>
      <View
        style={[StyleSheet.absoluteFill, !shown && styles.hidden]}
        pointerEvents="none"
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        // On the web build, what it's doing, for the e2e (as the rings' data-motion).
        {...(Platform.OS === "web" ? { dataSet: { scene: shown ? "3d" : "loading", settled: String(settled) } } : {})}
      >
        <Scene
          key={map.width}
          map={map}
          still={played.current}
          onReady={() => setReadyAt(map.width)}
          onSettled={() => {
            played.current = true;
            setSettled(true);
          }}
          onLost={() => setFailed(true)}
        />
      </View>
    </SceneBoundary>
  );
}

/** Runs `run` when the screen is idle (or soon, where there's no idle callback); returns a cancel. */
function whenIdle(run: () => void): () => void {
  const g = globalThis as {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (g.requestIdleCallback) {
    const id = g.requestIdleCallback(run, { timeout: 2000 });
    return () => g.cancelIdleCallback?.(id);
  }
  const id = setTimeout(run, 300);
  return () => clearTimeout(id);
}

/** Any failure inside the scene (or its GL) brings the flat map back. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
});
