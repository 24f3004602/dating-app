/**
 * MOB-20 (BUG-005, found on a device): a screen pads only the edges no bar covers. Under the
 * stack's top bar, or between the sign band and the bottom bar, the status bar inset was
 * added a second time (44 dp of empty space on a Pixel 8 Pro).
 */
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ALL_EDGES, BETWEEN_BARS, Screen, ScreenEdges, UNDER_TOP_BAR } from "@/ui/primitives";

const mockEdges: unknown[] = [];
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  const { createElement } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    ...actual,
    SafeAreaView: ({ edges, ...rest }: { edges: unknown }) => {
      mockEdges.push(edges);
      return createElement(View, rest);
    },
  };
});
beforeEach(() => {
  mockEdges.length = 0;
});

test("without a bar around it, a screen pads every edge", async () => {
  await render(
    <Screen>
      <Text>Welcome</Text>
    </Screen>,
  );
  expect(screen.getByText("Welcome")).toBeTruthy();
  expect(mockEdges.at(-1)).toEqual(ALL_EDGES);
});

test.each([
  ["under the stack's top bar", UNDER_TOP_BAR, ["right", "bottom", "left"]],
  ["between the sign band and the bottom bar", BETWEEN_BARS, ["right", "left"]],
])("%s, it leaves the covered edges to the bars", async (_where, edges, expected) => {
  await render(
    <ScreenEdges.Provider value={edges}>
      <Screen>
        <Text>Today</Text>
      </Screen>
    </ScreenEdges.Provider>,
  );
  expect(mockEdges.at(-1)).toEqual(expected);
  expect(mockEdges.at(-1)).not.toContain("top");
});
