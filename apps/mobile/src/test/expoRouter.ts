/**
 * expo-router for screen tests: the real module, except that the actions a screen gives
 * the top bar (`<Stack.Screen options>`, stage 20e) render in place, where tests can find
 * and press them, since screen tests have no navigator. jest.setup.ts installs it; a test
 * that also stands in for the router spreads it.
 */
export function expoRouterInPlace() {
  const actual = jest.requireActual<Record<string, unknown>>("expo-router");
  const Screen = ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null;
  return { ...actual, Stack: Object.assign({}, actual.Stack, { Screen }) };
}
