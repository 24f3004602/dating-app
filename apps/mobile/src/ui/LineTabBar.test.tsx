/** MOB-18 (stage 20e, D105): the bottom bar is a named tab list of four stops on one line. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { t } from "@/i18n/en";
import { color, touch } from "@/theme/tokens";
import { LineBar, Stop } from "@/ui/LineTabBar";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

test("a named tab list; each stop is a tab with its name, and only the current one is selected", async () => {
  const onPress = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LineBar label={t.tabs.label}>
        <Stop label={t.tabs.today} isFocused onPress={onPress} />
        <Stop label={t.tabs.likes} onPress={onPress} />
        <Stop label={t.tabs.matches} onPress={onPress} />
        <Stop label={t.tabs.you} onPress={onPress} />
      </LineBar>
    </SafeAreaProvider>,
  );
  // The container is named and has the tablist role, but is not one accessibility element:
  // on Android that would merge the four tabs into a single TalkBack stop.
  const bar = screen.getByLabelText(t.tabs.label);
  expect(bar.props.role).toBe("tablist");
  expect(bar.props.accessible).toBeUndefined();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  for (const name of [t.tabs.today, t.tabs.likes, t.tabs.matches, t.tabs.you]) {
    expect(screen.getByRole("tab", { name })).toBeTruthy(); // the name assistive tech reads
  }
  expect(screen.getByRole("tab", { name: t.tabs.today, selected: true })).toBeTruthy();
  expect(screen.getAllByRole("tab", { selected: false })).toHaveLength(3);
  await fireEvent.press(screen.getByRole("tab", { name: t.tabs.likes }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("each stop is at least 48 dp tall, and the place you're at is a filled roundel on a graphite sign", async () => {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LineBar label={t.tabs.label}>
        <Stop label={t.tabs.today} isFocused onPress={jest.fn()} />
      </LineBar>
    </SafeAreaProvider>,
  );
  const tab = screen.getByRole("tab", { name: t.tabs.today });
  const style = StyleSheet.flatten(typeof tab.props.style === "function" ? tab.props.style({ pressed: false }) : tab.props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(touch.min);
  expect(StyleSheet.flatten(screen.getByText(t.tabs.today).props.style).color).toBe(color.onSign);
});
