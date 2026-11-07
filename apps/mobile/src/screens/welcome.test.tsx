/** MOB-15 (stage 19, D099): the welcome screen over its video's still and the dark overlay. */
import { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { WelcomeScreen } from "@/screens/auth";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";
import { color } from "@/theme/tokens";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));

test("phones show the loop's still under the overlay, and the words turn light to keep their contrast", async () => {
  const { api } = fakeApi({});
  await renderWithApp(<WelcomeScreen />, api);
  const still = screen.getByTestId("welcome-still", { includeHiddenElements: true });
  expect((still.props.source as { uri: string }).uri).toMatch(/\/media\/candles-v1-720\.webp$/);
  expect(StyleSheet.flatten(screen.getByRole("heading", { name: t.welcome.title }).props.style).color).toBe(color.onAccent);
  expect(StyleSheet.flatten(screen.getByText(t.welcome.adults).props.style).color).toBe(color.onAccent);
  // The buttons keep their own colours (white on teal, teal on white), which hold on any background.
  expect(screen.getByRole("button", { name: t.welcome.signUp })).toBeTruthy();
  expect(screen.getByRole("button", { name: t.welcome.signIn })).toBeTruthy();
});
