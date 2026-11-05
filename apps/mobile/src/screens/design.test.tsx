import { fireEvent, render, screen } from "@testing-library/react-native";

import { color } from "@/theme/tokens";
import { DesignGallery } from "@/screens/design";

jest.mock("expo-router", () => ({ Link: ({ children }: { children: unknown }) => children }));

test("the gallery shows every colour role and every component state", async () => {
  await render(<DesignGallery />);
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
