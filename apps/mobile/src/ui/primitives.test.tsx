/** The design system's components: roles, names and states for screen readers. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { Badge, Button, Card, CardTitle, Checkbox, ChoiceGroup, Notice, TextField, Thumb, Title } from "@/ui/primitives";

jest.mock("expo-router", () => ({ Link: ({ children }: { children: unknown }) => children }));

/** Host elements by prop: groups and alerts aren't native accessibility elements, so role queries skip them. */
function hostsWhere(test: (props: Record<string, unknown>) => boolean) {
  return screen.container.queryAll((node) => typeof node.type === "string" && test(node.props));
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
  expect(screen.getByText("✓", { includeHiddenElements: true })).toBeTruthy(); // seen on screen
  expect(screen.queryByText("✓")).toBeNull(); // not read out: the radio's state says it
  await fireEvent.press(screen.getByRole("radio", { name: "Open to see" }));
  expect(onChange).toHaveBeenCalledWith("open");
});

test("a checkbox toggles and reports its state", async () => {
  const onChange = jest.fn();
  await render(<Checkbox label="Also block" checked onChange={onChange} />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Also block", checked: true }));
  expect(onChange).toHaveBeenCalledWith(false);
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
