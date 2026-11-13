/**
 * MOB-3D-5..8 (stage 21b, D122): the welcome's 3D scene is laid over the flat map only
 * when motion is welcome, loads once the screen is idle, shows only once its first frames
 * match the flat map, takes the flat rings' place, and gives the flat map back if
 * anything fails. The scene itself (three.js on a GL canvas) is a stand-in here; it's
 * checked in the browser (e2e) and on the phone.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text } from "react-native";

import { motion } from "@/theme/tokens";
import { resetMotionSetting } from "@/ui/motion";
import { RouteMap } from "@/ui/RouteMap";
import { type ScenePhase, sceneLoader, Welcome3D } from "@/ui/Welcome3D";
import type { SceneProps } from "@/ui/welcome3d/InterchangeScene";
import { welcomeMap } from "@/ui/welcomeMap";

const reduceMotion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;

/** The stand-in scene: it renders a marker and hands its props to the test. */
let scenes: SceneProps[] = [];
let breakScene = false;
function FakeScene(props: SceneProps) {
  scenes.push(props);
  if (breakScene) throw new Error("GL failed");
  return <Text testID="scene">{props.still ? "still" : "moving"}</Text>;
}

/** Past the flat rings' entrance (the scene waits for it), then idle. */
const settle = () =>
  act(async () => {
    jest.advanceTimersByTime(motion.duration.hero);
  });
const latest = () => scenes.at(-1)!;
/** The opacity of the scene's wrapper (0 while hidden). */
const shownOpacity = () => {
  for (let node = screen.getByTestId("scene", { includeHiddenElements: true }).parent; node; node = node.parent) {
    const opacity = StyleSheet.flatten(node.props.style)?.opacity;
    if (opacity !== undefined) return opacity;
  }
  return 1;
};

let load: jest.SpyInstance;
const idle = globalThis as { requestIdleCallback?: (cb: () => void) => number };

beforeEach(() => {
  jest.useFakeTimers();
  resetMotionSetting();
  scenes = [];
  breakScene = false;
  reduceMotion.mockResolvedValue(false);
  // The screen is idle at once.
  idle.requestIdleCallback = (cb) => {
    cb();
    return 1;
  };
  load = jest.spyOn(sceneLoader, "load").mockResolvedValue(FakeScene as ComponentType<SceneProps>);
});

afterEach(() => {
  jest.useRealTimers();
  load.mockRestore();
  delete idle.requestIdleCallback;
  reduceMotion.mockResolvedValue(true);
});

test("MOB-3D-5: with motion on, the scene loads once the rings have met and the screen is idle, and shows once its first frames are drawn", async () => {
  const phases: ScenePhase[] = [];
  await render(<Welcome3D map={welcomeMap(342)} onPhase={(p) => phases.push(p)} />);
  // Not during the flat rings' entrance.
  await act(async () => {
    jest.advanceTimersByTime(motion.duration.hero - 1);
  });
  expect(load).not.toHaveBeenCalled();
  await settle();
  expect(load).toHaveBeenCalledTimes(1);
  // Mounted, but hidden: the flat map is still the picture.
  expect(shownOpacity()).toBe(0);
  expect(latest().still).toBe(false);
  expect(phases.at(-1)).toBe("flat");
  await act(async () => latest().onReady());
  expect(shownOpacity()).toBe(1);
  expect(phases.at(-1)).toBe("3d");
  // Decoration: nothing in it for screen readers.
  expect(screen.queryByTestId("scene")).toBeNull();
});

test("MOB-3D-6: reduce motion (or not knowing it yet) keeps the flat map: nothing loads", async () => {
  reduceMotion.mockResolvedValue(true);
  await render(<Welcome3D map={welcomeMap(342)} onPhase={() => {}} />);
  await settle();
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByTestId("scene", { includeHiddenElements: true })).toBeNull();
});

test("MOB-3D-7: a failure in the scene, or a lost context, gives the flat map back", async () => {
  const phases: ScenePhase[] = [];
  const view = await render(<Welcome3D map={welcomeMap(342)} onPhase={(p) => phases.push(p)} />);
  await settle();
  await act(async () => latest().onReady());
  expect(phases.at(-1)).toBe("3d");
  // The scene throws (its GL failed): the boundary catches it.
  breakScene = true;
  jest.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => view.rerender(<Welcome3D map={welcomeMap(343)} onPhase={(p) => phases.push(p)} />));
  expect(screen.queryByTestId("scene", { includeHiddenElements: true })).toBeNull();
  expect(phases.at(-1)).toBe("flat");
  (console.error as jest.Mock).mockRestore();

  // A lost context does the same.
  breakScene = false;
  scenes = [];
  const again = await render(<Welcome3D map={welcomeMap(342)} onPhase={(p) => phases.push(p)} />);
  await settle();
  await act(async () => latest().onLost());
  expect(screen.queryByTestId("scene", { includeHiddenElements: true })).toBeNull();
  again.unmount();
});

test("MOB-3D-8: after it has played, a new width starts the scene again at rest, hidden until drawn", async () => {
  const view = await render(<Welcome3D map={welcomeMap(342)} onPhase={() => {}} />);
  await settle();
  await act(async () => {
    latest().onReady();
    latest().onSettled();
  });
  await act(async () => view.rerender(<Welcome3D map={welcomeMap(400)} onPhase={() => {}} />));
  expect(latest().still).toBe(true);
  expect(shownOpacity()).toBe(0);
  await act(async () => latest().onReady());
  expect(shownOpacity()).toBe(1);
});

test("MOB-3D-5: on the map, the flat rings fade out (base duration) as the scene's fade in", async () => {
  const timing = jest.spyOn(Animated, "timing");
  await render(<RouteMap />);
  const map = screen.getByRole("img");
  await act(() => fireEvent(map, "layout", { nativeEvent: { layout: { width: 342, height: 176 } } }));
  await settle();
  timing.mockClear();
  await act(async () => latest().onReady());
  const fades = timing.mock.calls.filter(([, config]) => config.toValue === 0 && config.duration === motion.duration.base);
  expect(fades).toHaveLength(1);
  timing.mockRestore();
});
