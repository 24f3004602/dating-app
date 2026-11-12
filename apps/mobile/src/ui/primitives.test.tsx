/** The design system's components: roles, names and states for screen readers. */
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { AccessibilityInfo, Platform, type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { color, size } from "@/theme/tokens";
import { Badge, Button, Card, CardTitle, Checkbox, ChoiceGroup, ListRow, Notice, Screen, ScreenEdges, SwitchRow, TextField, Thumb, Title, UNDER_TOP_BAR } from "@/ui/primitives";

jest.mock("expo-router", () => ({
  ...require("@/test/expoRouter").expoRouterInPlace(),
  Link: ({ children }: { children: unknown }) => children,
}));

/** Host elements by prop: groups and alerts aren't native accessibility elements, so role queries skip them. */
function hostsWhere(test: (props: Record<string, unknown>) => boolean) {
  return screen.container.queryAll((node) => typeof node.type === "string" && test(node.props));
}

/** The drawn ticks on screen: two sides of a small box in the roundel's stroke, turned (D115, D116). */
function drawnTicks() {
  return hostsWhere((p) => {
    const s = StyleSheet.flatten(p.style as StyleProp<ViewStyle>);
    return s?.borderRightWidth === size.roundelStroke && s?.borderBottomWidth === size.roundelStroke && s?.transform !== undefined;
  });
}

test("a busy button keeps its name, says it's busy and can't be pressed twice", async () => {
  const onPress = jest.fn();
  await render(<Button label="Save" busy onPress={onPress} />);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).toBeBusy();
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
  expect(screen.queryByText("Save")).toBeNull(); // the spinner shows instead of the text
});

test("a disabled button is announced as disabled", async () => {
  const onPress = jest.fn();
  await render(<Button label="Send" disabled onPress={onPress} variant="secondary" />);
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Send" }));
  expect(onPress).not.toHaveBeenCalled();
});

test("fields name themselves, show hints and flag errors", async () => {
  await render(<TextField label="Email" hint="We never show it." error="Enter a valid email address." value="" />);
  const input = screen.getByLabelText("Email");
  expect(input.props["aria-invalid"]).toBe(true);
  expect(input.props.accessibilityHint).toBe("We never show it.");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
});

test("choices: the selected one is checked, and its tick is hidden from screen readers", async () => {
  const onChange = jest.fn();
  await render(
    <ChoiceGroup label="Intention" value="long" onChange={onChange}
      options={[{ value: "long", label: "Long-term" }, { value: "open", label: "Open to see" }]} />,
  ); // prettier-ignore
  expect(hostsWhere((p) => p.role === "radiogroup").map((n) => n.props["aria-label"])).toEqual(["Intention"]);
  expect(screen.getByRole("radio", { name: "Long-term", checked: true })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Open to see", checked: false })).toBeTruthy();
  // The chosen chip has the drawn tick (no glyph that grows with the text, D116), hidden: the state says it.
  expect(screen.queryByText("✓", { includeHiddenElements: true })).toBeNull();
  expect(drawnTicks()).toHaveLength(1);
  expect(drawnTicks()[0]?.props["aria-hidden"]).toBe(true);
  // The turned tick is wider than its own box: the chip gives it room before the label (seen on the phone).
  const turnedWidth = (size.checkbox * 0.3 + size.checkbox * 0.5) * Math.SQRT1_2;
  const room = hostsWhere((p) => (StyleSheet.flatten(p.style as StyleProp<ViewStyle>)?.width as number) >= turnedWidth && p["aria-hidden"] === true);
  expect(room).toHaveLength(1);
  await fireEvent.press(screen.getByRole("radio", { name: "Open to see" }));
  expect(onChange).toHaveBeenCalledWith("open");
});

test("a checkbox toggles and reports its state", async () => {
  const onChange = jest.fn();
  await render(<Checkbox label="Also block" checked onChange={onChange} />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Also block", checked: true }));
  expect(onChange).toHaveBeenCalledWith(false);
});

test("a box's tick is drawn, so it stays inside the box at any text size (MOB-33)", async () => {
  // A ✓ glyph grows with the system text size: at 1.3 on the phone it outgrew the box and was cut off.
  const onChange = jest.fn();
  await render(
    <>
      <Checkbox label="Also block" checked onChange={jest.fn()} />
      <Checkbox label="Pause" checked={false} onChange={jest.fn()} />
      <ChoiceGroup multiple layout="list" label="Tell me about" value={["matches"]} onChange={onChange}
        options={[{ value: "matches", label: "New matches" }, { value: "messages", label: "New messages" }]} />
    </>,
  ); // prettier-ignore
  expect(screen.queryByText("✓", { includeHiddenElements: true })).toBeNull();
  const ticks = hostsWhere((p) => {
    const s = StyleSheet.flatten(p.style as StyleProp<ViewStyle>);
    return s?.borderRightWidth === size.roundelStroke && s?.borderBottomWidth === size.roundelStroke && s?.transform !== undefined;
  });
  expect(ticks).toHaveLength(2); // the checked box and the chosen row; none for the others
  for (const tick of ticks) expect(StyleSheet.flatten(tick.props.style as StyleProp<ViewStyle>)?.height).toBeLessThan(size.checkbox);
});

test("notices: errors are alerts, others are polite updates", async () => {
  await render(
    <>
      <Notice kind="error">Not sent.</Notice>
      <Notice kind="success">Saved.</Notice>
    </>,
  );
  const [alert, ...others] = hostsWhere((p) => p.role === "alert");
  expect(others).toEqual([]);
  expect(alert).toHaveTextContent("Not sent.");
  expect(screen.getByText("Saved.")).toBeTruthy();
});

test("on iOS, which ignores live regions, errors are announced; other notices aren't", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  announce.mockClear(); // React Native's jest setup already made it a shared mock
  const os = Platform.OS;
  Platform.OS = "ios";
  try {
    await render(
      <>
        <Notice kind="error">Not sent.</Notice>
        <Notice kind="info">Saved as a draft.</Notice>
        <TextField label="Code" error="Enter the 6-digit code." value="" />
      </>,
    );
    expect(announce.mock.calls.map((c) => c[0])).toEqual(["Not sent.", "Enter the 6-digit code."]);
  } finally {
    Platform.OS = os;
    announce.mockRestore();
  }
});

test("a card is one button named by its label, with no heading inside", async () => {
  const onPress = jest.fn();
  await render(
    <Card label="Chat with Asha, 27. 2 new" onPress={onPress}>
      <Thumb uri="https://example.invalid/a.jpg" />
      <CardTitle>Asha, 27</CardTitle>
      <Badge label="2 new" />
    </Card>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Chat with Asha, 27. 2 new" }));
  expect(onPress).toHaveBeenCalled();
  expect(screen.queryByRole("heading")).toBeNull();
  const photos = hostsWhere((p) => (p.source as { uri?: string } | undefined)?.uri === "https://example.invalid/a.jpg");
  expect(photos.map((n) => n.props["aria-hidden"])).toEqual([true]); // decorative: the label names the person
});

test("titles are level-1 headings; a labelled photo is an image", async () => {
  await render(
    <>
      <Title>Safety</Title>
      <Thumb uri="https://example.invalid/b.jpg" label="Your cover photo" />
    </>,
  );
  expect(screen.getByRole("heading", { name: "Safety" }).props["aria-level"]).toBe(1);
  const photo = screen.getByLabelText("Your cover photo");
  expect(photo.props.role).toBe("img");
});

test("a list row is one button named by its label; the hint is read after it, the arrow is hidden", async () => {
  const onPress = jest.fn();
  await render(<ListRow label="Photos" hint="1 of 6 photos" opens onPress={onPress} />);
  const row = screen.getByRole("button", { name: "Photos" });
  expect(row.props.accessibilityHint).toBe("1 of 6 photos");
  expect(within(row).getByText("1 of 6 photos")).toBeTruthy();
  expect(hostsWhere((p) => p["aria-hidden"] === true)).toHaveLength(1); // the arrow
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalled();
});

test("choices that are sentences are a list: rows with the line's roundel, filled when chosen (MOB-30)", async () => {
  const onChange = jest.fn();
  await render(
    <ChoiceGroup layout="list" label="What's wrong?" value="scam" onChange={onChange}
      options={[{ value: "fake", label: "Fake profile or pretending to be someone else" }, { value: "scam", label: "Scam, or asking for money" }]} />,
  ); // prettier-ignore
  expect(hostsWhere((p) => p.role === "radiogroup").map((n) => n.props["aria-label"])).toEqual(["What's wrong?"]);
  expect(screen.getByRole("radio", { name: "Scam, or asking for money", checked: true })).toBeTruthy();
  const other = screen.getByRole("radio", { name: "Fake profile or pretending to be someone else", checked: false });
  // Full-width rows with a line under each, not chips.
  expect(StyleSheet.flatten(other.props.style)).toMatchObject({ flexDirection: "row", borderBottomWidth: 1 });
  // The roundel is hidden from screen readers (the radio's state says it) and filled only when chosen.
  const roundels = hostsWhere((p) => p["aria-hidden"] === true && StyleSheet.flatten(p.style as StyleProp<ViewStyle>)?.width === size.roundel);
  expect(roundels.map((n) => StyleSheet.flatten(n.props.style as StyleProp<ViewStyle>)?.backgroundColor)).toEqual([color.bg, color.sign]);
  // A long label wraps inside its row instead of running off the screen.
  expect(StyleSheet.flatten(within(other).getByText(/^Fake profile/).props.style).flexShrink).toBe(1);
  await fireEvent.press(other);
  expect(onChange).toHaveBeenCalledWith("fake");
});

test("several choices in a list are checkboxes in a group", async () => {
  const onChange = jest.fn();
  await render(
    <ChoiceGroup multiple layout="list" label="Tell me about" value={["matches"]} onChange={onChange}
      options={[{ value: "matches", label: "New matches" }, { value: "messages", label: "New messages" }]} />,
  ); // prettier-ignore
  expect(hostsWhere((p) => p.role === "group").map((n) => n.props["aria-label"])).toEqual(["Tell me about"]);
  expect(screen.getByRole("checkbox", { name: "New matches", checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "New messages" }));
  expect(onChange).toHaveBeenCalledWith(["matches", "messages"]);
});

test("a screen's name joins the top bar once its title has scrolled under it, hidden from screen readers (MOB-34)", async () => {
  // The options the screen gives its top bar: on Android a title function, even one that
  // draws nothing, takes the bar's left slot and the back arrow with it (seen on the phone).
  const barOptions = jest.spyOn(Stack, "Screen");
  const titleOption = () => (barOptions.mock.lastCall?.[0] as { options?: { headerTitle?: unknown } } | undefined)?.options?.headerTitle;
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <ScreenEdges.Provider value={UNDER_TOP_BAR}>
        <Screen>
          <Title>Privacy</Title>
          <Notice kind="info">Long content below the title.</Notice>
        </Screen>
      </ScreenEdges.Provider>
    </SafeAreaProvider>,
  );
  const title = screen.getByRole("heading", { name: "Privacy" });
  await fireEvent(title, "layout", { nativeEvent: { layout: { x: 0, y: 24, width: 380, height: 40 } } });
  const scrollTo = (y: number) => fireEvent.scroll(title, { nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 412, height: 2000 }, layoutMeasurement: { width: 412, height: 800 } } });
  expect(screen.getAllByText("Privacy", { includeHiddenElements: true })).toHaveLength(1); // at the top: only the page's heading
  expect(titleOption()).toBeUndefined(); // no title function: the back arrow stays
  await scrollTo(30); // the title is still partly in view
  expect(screen.getAllByText("Privacy", { includeHiddenElements: true })).toHaveLength(1);
  await scrollTo(100); // the title is under the bar: the bar names the screen
  expect(screen.getAllByText("Privacy", { includeHiddenElements: true })).toHaveLength(2);
  expect(screen.getAllByText("Privacy")).toHaveLength(1); // screen readers still hear one heading
  expect(titleOption()).toEqual(expect.any(Function));
  await scrollTo(0);
  expect(screen.getAllByText("Privacy", { includeHiddenElements: true })).toHaveLength(1);
  expect(titleOption()).toBeUndefined();
  barOptions.mockRestore();
});

test("a setting that takes effect at once is a switch named by its label, and the label flips it too (MOB-35)", async () => {
  const onChange = jest.fn();
  await render(<SwitchRow label="Pause new introductions" value={false} onChange={onChange} />);
  const toggle = screen.getByRole("switch", { name: "Pause new introductions", checked: false });
  await fireEvent(toggle, "valueChange", true);
  expect(onChange).toHaveBeenLastCalledWith(true);
  // The label is a second place to tap, not a second control: screen readers meet only the switch.
  expect(screen.queryByText("Pause new introductions")).toBeNull();
  await fireEvent.press(screen.getByText("Pause new introductions", { includeHiddenElements: true }));
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  // The thumb shows its place in both states: graphite when off (white vanished on the page), white on teal when on.
  const thumb = () => screen.getByRole("switch", { name: "Pause new introductions" }).props.thumbTintColor;
  expect(thumb()).toBe(color.sign);
  await screen.rerender(<SwitchRow label="Pause new introductions" value onChange={onChange} />);
  expect(thumb()).toBe(color.bg);
});

test("destructive rows are in the error colour, and a box's edge is the roundel's graphite stroke (MOB-37)", async () => {
  await render(
    <>
      <ListRow label="Block" tone="danger" onPress={jest.fn()} />
      <ListRow label="Report" opens onPress={jest.fn()} />
      <Checkbox label="Also block" checked={false} onChange={jest.fn()} />
    </>,
  );
  expect(StyleSheet.flatten(screen.getByText("Block").props.style).color).toBe(color.danger);
  expect(StyleSheet.flatten(screen.getByText("Report").props.style).color).toBe(color.text);
  const box = hostsWhere((p) => StyleSheet.flatten(p.style as StyleProp<ViewStyle>)?.width === size.checkbox);
  expect(box).toHaveLength(1);
  expect(StyleSheet.flatten(box[0]?.props.style as StyleProp<ViewStyle>)).toMatchObject({ borderColor: color.sign, borderWidth: size.roundelStroke });
});
