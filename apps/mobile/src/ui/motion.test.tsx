/**
 * MOT-1..6 (stage 19, D098): motion follows the reduce-motion setting, uses the
 * motion tokens, and the ambient loop stops by itself. Animations are replaced
 * by stand-ins that record their settings, so nothing runs on a real clock.
 */
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";

import { color, motion } from "@/theme/tokens";
import { Reveal, resetMotionSetting, staggered, usePressScale, useReducedMotion } from "@/ui/motion";
import { Rings } from "@/ui/Rings";

const reduceMotion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
const listeners = AccessibilityInfo.addEventListener as jest.Mock;

const composite = () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as unknown as Animated.CompositeAnimation;
let timing: jest.SpyInstance;
let loop: jest.SpyInstance;

beforeEach(() => {
  resetMotionSetting();
  jest.clearAllMocks();
  timing = jest.spyOn(Animated, "timing").mockImplementation(composite);
  loop = jest.spyOn(Animated, "loop").mockImplementation(composite);
});

afterEach(() => {
  timing.mockRestore();
  loop.mockRestore();
});

/** The opacity of the nearest animated wrapper around some text, as last rendered. */
function opacityOf(text: string): unknown {
  for (let node = screen.getByText(text).parent; node; node = node.parent) {
    const opacity = StyleSheet.flatten(node.props.style)?.opacity;
    if (opacity !== undefined) return opacity;
  }
  return undefined;
}

const settle = () => act(async () => {});

test("with motion on, Reveal fades and rises in on the tokens' timing", async () => {
  reduceMotion.mockResolvedValueOnce(false);
  await render(
    <Reveal delay={staggered(2)}>
      <Text>Hello</Text>
    </Reveal>,
  );
  await settle();
  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing.mock.calls[0]?.[1]).toMatchObject({ toValue: 1, duration: motion.duration.base, delay: 2 * motion.stagger });
  expect(staggered(10)).toBe(6 * motion.stagger); // long lists don't keep people waiting
});

test("with reduce motion on, it is shown at rest and nothing animates", async () => {
  reduceMotion.mockResolvedValueOnce(true);
  await render(
    <Reveal>
      <Text>Hello</Text>
    </Reveal>,
  );
  await settle();
  expect(timing).not.toHaveBeenCalled();
  expect(opacityOf("Hello")).toBe(1);
});

test("until the setting is known, nothing moves", async () => {
  reduceMotion.mockReturnValueOnce(new Promise<boolean>(() => undefined)); // never answers
  await render(
    <Reveal>
      <Text>Hello</Text>
    </Reveal>,
  );
  await settle();
  expect(timing).not.toHaveBeenCalled();
});

test("something already on screen doesn't animate again", async () => {
  reduceMotion.mockResolvedValueOnce(false);
  await render(
    <Reveal appear={false}>
      <Text>Old message</Text>
    </Reveal>,
  );
  await settle();
  expect(timing).not.toHaveBeenCalled();
  expect(opacityOf("Old message")).toBe(1);
});

function Probe() {
  return <Text>{useReducedMotion() ? "still" : "moving"}</Text>;
}

test("the setting follows the phone when it changes", async () => {
  reduceMotion.mockResolvedValueOnce(false);
  await render(<Probe />);
  await settle();
  expect(screen.getByText("moving")).toBeTruthy();
  const changed = listeners.mock.calls.find(([name]) => name === "reduceMotionChanged")?.[1] as (on: boolean) => void;
  await act(async () => changed(true));
  expect(screen.getByText("still")).toBeTruthy();
});

test("the rings breathe twice, then rest (under 5 seconds: WCAG 2.2.2); joining plays once", async () => {
  reduceMotion.mockResolvedValue(false);
  await render(<Rings mode="breathe" />);
  await settle();
  expect(loop).toHaveBeenCalledTimes(1);
  expect(loop.mock.calls[0]?.[1]).toEqual({ iterations: 2 });
  expect(timing.mock.calls.map(([, config]) => (config as { duration: number }).duration)).toEqual([
    motion.duration.loop / 2,
    motion.duration.loop / 2,
  ]);

  loop.mockClear();
  timing.mockClear();
  await render(<Rings mode="join" />);
  await settle();
  expect(loop).not.toHaveBeenCalled();
  expect(timing.mock.calls.map(([, config]) => (config as { duration: number }).duration)).toContain(motion.duration.hero);
  // No glow on a match: the world is flat enamel (D117). Only the two rings are drawn, no marigold disc.
  const filled = screen.container.queryAll(
    (node) => typeof node.type === "string" && StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.backgroundColor === color.highlight,
  );
  expect(filled).toHaveLength(0);
  reduceMotion.mockReset();
  reduceMotion.mockImplementation(async () => true);
});

test("with reduce motion on, the rings are drawn at rest", async () => {
  reduceMotion.mockResolvedValueOnce(true);
  await render(<Rings mode="join" />);
  await settle();
  expect(timing).not.toHaveBeenCalled();
  expect(loop).not.toHaveBeenCalled();
});

function Pressy() {
  const press = usePressScale();
  return (
    <Text onPress={press.onPressIn} onLongPress={press.onPressOut}>
      Press
    </Text>
  );
}

test("buttons press in only with motion on", async () => {
  reduceMotion.mockResolvedValueOnce(false);
  await render(<Pressy />);
  await settle();
  screen.getByText("Press").props.onPress();
  expect(timing.mock.calls[0]?.[1]).toMatchObject({ toValue: 0.98, duration: motion.duration.fast });

  resetMotionSetting();
  timing.mockClear();
  reduceMotion.mockResolvedValueOnce(true);
  await render(<Pressy />);
  await settle();
  screen.getAllByText("Press").at(-1)?.props.onPress();
  expect(timing).not.toHaveBeenCalled();
});
