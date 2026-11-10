/** MOB-15 (stage 19, D099): the welcome screen over its video's still and the dark overlay. */
import { act, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { WelcomeScreen } from "@/screens/auth";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";
import { BRAND } from "@/config";
import { color, font } from "@/theme/tokens";

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
  // The buttons are sign plates with their own colours (graphite on marigold, graphite on white).
  expect(screen.getByRole("button", { name: t.welcome.signUp })).toBeTruthy();
  expect(screen.getByRole("button", { name: t.welcome.signIn })).toBeTruthy();
});

// MOB-16 (stage 20e, D105): the Interchange on the welcome screen.
test("the name is a station sign, and the route map is one described image on a white enamel panel", async () => {
  const { api } = fakeApi({});
  await renderWithApp(<WelcomeScreen />, api);
  const sign = screen.getByText(BRAND);
  expect(StyleSheet.flatten(sign.props.style)).toMatchObject({ fontFamily: font.sign, textTransform: "uppercase", color: color.onSign });
  expect(StyleSheet.flatten(screen.getByRole("heading", { name: t.welcome.title }).props.style).fontFamily).toBe(font.display);
  const map = screen.getByRole("img", { name: t.welcome.map.label });
  // The lines are drawn once the map knows its width.
  await act(() => fireEvent(map, "layout", { nativeEvent: { layout: { width: 320, height: 176 } } }));
  // The map's own words are drawn for sight only; the description above says it all.
  expect(screen.queryByText(t.welcome.map.both)).toBeNull();
  expect(screen.getByText(t.welcome.map.both, { includeHiddenElements: true })).toBeTruthy();
});

test("the primary action is a marigold sign plate lettered in graphite, square-cornered", async () => {
  const { api } = fakeApi({});
  await renderWithApp(<WelcomeScreen />, api);
  const plate = StyleSheet.flatten(screen.getByRole("button", { name: t.welcome.signUp }).props.style);
  expect(plate).toMatchObject({ backgroundColor: color.highlight, borderRadius: 0 });
});
