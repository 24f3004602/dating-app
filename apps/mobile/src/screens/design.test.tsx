import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { color } from "@/theme/tokens";
import { DesignGallery } from "@/screens/design";

jest.mock("expo-router", () => ({ Link: ({ children }: { children: unknown }) => children }));

// The app's root provides safe-area insets (expo-router does); the gallery's sample sheet reads them.
const METRICS = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
const renderGallery = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <DesignGallery />
    </SafeAreaProvider>,
  );

test("the gallery shows every colour role and every component state", async () => {
  await renderGallery();
  for (const role of Object.keys(color)) expect(screen.getByText(new RegExp(`^${role} #`))).toBeTruthy();
  for (const name of ["Primary", "Secondary", "Danger", "Primary, disabled", "Primary, busy"]) {
    expect(screen.getByRole("button", { name })).toBeTruthy();
  }
  expect(screen.getByRole("button", { name: "Primary, disabled" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Primary, busy" })).toBeBusy();
  expect(screen.getByRole("link", { name: "A text link" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Option two" }));
  expect(screen.getByRole("radio", { name: "Option two", checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Second" }));
  expect(screen.getByRole("checkbox", { name: "Second", checked: true })).toBeTruthy();
});

test("the gallery shows the Interchange's signs, lists, choice lists, More options and a sheet (DS-4)", async () => {
  await renderGallery();
  expect(screen.getByText("Sample name, 27")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "A heading on a plate" }).props["aria-level"]).toBe(2);
  for (const name of ["A place", "A place with a hint", "An action", "More options, on the page", "More options, on the sign"]) {
    expect(screen.getByRole("button", { name })).toBeTruthy();
  }
  // A choice list keeps the radio and checkbox states.
  expect(screen.getByRole("radio", { name: "A short sentence to choose", checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: /^A longer sentence/ }));
  expect(screen.getByRole("radio", { name: /^A longer sentence/, checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "The next sentence to tick" }));
  expect(screen.getByRole("checkbox", { name: "The next sentence to tick", checked: true })).toBeTruthy();
  // The sample sheet opens as a dialog and its Close closes it.
  await fireEvent.press(screen.getByRole("button", { name: "Open a sample sheet" }));
  expect(screen.getByLabelText("A sample sheet")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByLabelText("A sample sheet")).toBeNull();
});
