/** The safety guide (S11, D140): SAFE-GUIDE-APP-1..3; the ways into it are SAFE-GUIDE-APP-4 (safety and live tests). */
import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { fill, t } from "@/i18n/en";
import { SafetyGuideScreen } from "@/screens/safetyGuide";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const guide = t.safetyGuide;
const lines = guide.helplines.items;

beforeEach(() => {
  jest.clearAllMocks(); // the preset's Linking is already a mock: clear its calls between tests
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

async function renderGuide() {
  const { api, calls } = fakeApi({});
  await renderWithApp(<SafetyGuideScreen />, api);
  return calls;
}

/** Host elements with a role: lists aren't native accessibility elements, so role queries skip them. */
/** What the renderer gives back: a node, its host type, its props and its parent. */
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null };

function hostsWithRole(role: string): Node[] {
  return screen.container.queryAll((node) => typeof node.type === "string" && node.props.role === role);
}

function insideRole(node: Node, role: string): boolean {
  for (let up = node.parent; up; up = up.parent) {
    if (typeof up.type === "string" && up.props.role === role) return true;
  }
  return false;
}

test("SAFE-GUIDE-APP-1: a title, a level-2 heading per section, and every point an item in a list; nothing is fetched", async () => {
  const calls = await renderGuide();
  expect(screen.getByRole("heading", { name: guide.title }).props["aria-level"]).toBe(1);
  for (const title of [...guide.sections.map((s) => s.title), guide.helplines.title]) {
    expect(screen.getByRole("heading", { name: title }).props["aria-level"]).toBe(2);
  }
  // One list per section and one of helplines; each point and each helpline is an item.
  expect(hostsWithRole("list")).toHaveLength(guide.sections.length + 1);
  const points = guide.sections.flatMap((s) => s.points);
  expect(hostsWithRole("listitem")).toHaveLength(points.length + lines.length);
  for (const point of points) expect(insideRole(screen.getByText(point), "listitem")).toBe(true);
  for (const line of lines) expect(insideRole(screen.getByText(line.about), "listitem")).toBe(true);
  // Static words: it works with no connection and tells the server nothing.
  expect(calls).toEqual([]);
});

test("SAFE-GUIDE-APP-2: each helpline's button opens the dialer with its number; 112 also comes first", async () => {
  await renderGuide();
  const open = Linking.openURL as jest.Mock;
  // 112 is offered at the top, before any reading, and again in the list.
  const emergency = screen.getAllByRole("button", { name: fill(guide.helplines.callName, lines[0]) });
  expect(emergency).toHaveLength(2);
  await fireEvent.press(emergency[0]!);
  expect(open.mock.calls).toEqual([["tel:112"]]);
  for (const line of lines) {
    open.mockClear();
    // The button says "Call 181"; its name adds whose number it is (WCAG 2.5.3: it starts with the words shown).
    expect(screen.getAllByText(fill(guide.helplines.call, { number: line.number })).length).toBeGreaterThan(0);
    const buttons = screen.getAllByRole("button", { name: fill(guide.helplines.callName, line) });
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(open.mock.calls).toEqual([[`tel:${line.number}`]]);
  }
  // The cyber crime portal opens in the browser.
  open.mockClear();
  await fireEvent.press(screen.getByRole("link", { name: guide.helplines.portal }));
  expect(open.mock.calls).toEqual([["https://cybercrime.gov.in"]]);
  // With no dialer (a tablet, a desktop browser) nothing breaks, and the number stays on screen.
  open.mockRejectedValueOnce(new Error("no dialer"));
  await fireEvent.press(screen.getAllByRole("button", { name: fill(guide.helplines.callName, lines[1]) })[0]!);
  expect(screen.getByText(lines[1].number)).toBeTruthy();
});

test("SAFE-GUIDE-APP-3: every number the words mention is one of the helplines, so the two can't drift apart", () => {
  const numbers = lines.map((line) => line.number);
  for (const number of numbers) expect(number).toMatch(/^\d{3,5}$/);
  expect(new Set(numbers).size).toBe(numbers.length);
  const words = [guide.intro, guide.danger, ...guide.sections.flatMap((s) => s.points), ...lines.map((line) => line.about)];
  const mentioned = words.flatMap((w) => w.match(/\b\d{3,}\b/g) ?? []);
  expect(mentioned).toEqual(expect.arrayContaining(["112", "1930"]));
  for (const number of mentioned) expect(numbers).toContain(number);
  // The first line, for someone in danger now, is the emergency number, first in the list.
  expect(lines[0]).toMatchObject({ number: "112", name: "Emergency" });
  expect(guide.danger).toContain(lines[0].number);
});
