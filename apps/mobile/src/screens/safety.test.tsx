import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { fill, t } from "@/i18n/en";
import { dayInIndia } from "@/i18n/time";
import { ReportScreen, reportHref, SafetyActions, SafetyScreen } from "@/screens/safety";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
beforeEach(() => jest.clearAllMocks());

const msg = (n: number, fromMe: boolean, body: string, removed = false) => ({
  id: `id${n}`, n, from_me: fromMe, body, sent_at: "2026-11-05T09:00:00Z",
  client_message_id: fromMe ? `c${n}` : null, safety_tip: null, removed,
}); // prettier-ignore

test("unmatch asks first; cancel keeps the match, confirming ends it", async () => {
  const onEnded = jest.fn();
  const { api, calls } = fakeApi({ "POST /v1/matches/m1/unmatch": () => ({ status: 204 }) });
  await renderWithApp(<SafetyActions userId="u2" name="Kabir" matchId="m1" onEnded={onEnded} />, api);
  await fireEvent.press(screen.getByRole("button", { name: t.chat.unmatch }));
  expect(screen.getByText(t.chat.confirmUnmatch)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.chat.keep }));
  expect(calls).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: t.chat.unmatch }));
  await fireEvent.press(screen.getByRole("button", { name: t.chat.unmatch }));
  await waitFor(() => expect(onEnded).toHaveBeenCalled());
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/matches/m1/unmatch"]);
});

test("block asks first and names the person; report opens the form", async () => {
  const onEnded = jest.fn();
  const { api, calls } = fakeApi({ "POST /v1/blocks": () => ({ status: 204 }) });
  await renderWithApp(<SafetyActions userId="u2" name="Kabir" onEnded={onEnded} />, api);
  expect(screen.queryByRole("button", { name: t.chat.unmatch })).toBeNull(); // not a match
  await fireEvent.press(screen.getByRole("button", { name: t.chat.report }));
  expect(mockRouter.push).toHaveBeenCalledWith("/report/u2?name=Kabir");
  await fireEvent.press(screen.getByRole("button", { name: t.chat.block }));
  expect(screen.getByText(fill(t.chat.confirmBlock, { name: "Kabir" }))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.chat.block }));
  await waitFor(() => expect(onEnded).toHaveBeenCalled());
  expect(calls[0]?.body).toEqual({ user_id: "u2" });
  expect(reportHref("u2", "Ravi Kumar", "m 1")).toBe("/report/u2?name=Ravi%20Kumar&match=m%201");
});

test("a report needs a reason, can name one of their messages, and blocks by default", async () => {
  const { api, calls } = fakeApi({
    "GET /v1/matches/m1/messages": () => ({
      status: 200,
      body: { items: [msg(1, false, "Hi"), msg(2, true, "Hello"), msg(3, false, "Send money on UPI"), msg(4, false, "", true)], has_more: false },
    }),
    "POST /v1/reports": () => ({ status: 201, body: { id: "r1", reason: "scam", about: "message", subject_name: "Kabir", status: "open", created_at: "2026-11-05T09:00:00Z" } }),
  });
  await renderWithApp(<ReportScreen subjectId="u2" name="Kabir" matchId="m1" />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.report.send }));
  expect(await screen.findByText(t.report.chooseReason)).toBeTruthy();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

  // Both questions are lists of rows, not chips (D112).
  expect(StyleSheet.flatten(screen.getByRole("radio", { name: t.report.reasons.scam }).props.style).borderBottomWidth).toBe(1);
  await fireEvent.press(screen.getByRole("radio", { name: t.report.reasons.scam }));
  // Only their messages, newest first, never removed ones.
  const choices = screen.getAllByRole("radio", { name: /^Message: / });
  expect(choices).toHaveLength(2);
  expect(choices[0]).toBe(screen.getByRole("radio", { name: "Message: Send money on UPI" }));
  expect(choices[1]).toBe(screen.getByRole("radio", { name: "Message: Hi" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Message: Send money on UPI" }));
  await fireEvent.changeText(screen.getByLabelText(t.report.details), "  Asked twice.  ");
  expect(screen.getByRole("checkbox", { name: fill(t.report.alsoBlock, { name: "Kabir" }), checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.report.send }));
  expect(await screen.findByText(t.report.sent)).toBeTruthy();
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    subject_id: "u2", reason: "scam", block: true, details: "Asked twice.", message_id: "id3",
  }); // prettier-ignore
  await fireEvent.press(screen.getByRole("button", { name: t.report.toSafety }));
  expect(mockRouter.replace).toHaveBeenCalledWith("/safety");
});

test("a report from a profile can skip blocking; errors get the app's words", async () => {
  let answer: { status: number; body?: unknown } = problem(429, "rate_limited");
  const { api, calls } = fakeApi({ "POST /v1/reports": () => answer });
  await renderWithApp(<ReportScreen subjectId="u2" name="Kabir" />, api);
  expect(screen.queryByText(t.report.about)).toBeNull(); // no messages to choose from
  await fireEvent.press(screen.getByRole("radio", { name: t.report.reasons.fake }));
  await fireEvent.press(screen.getByRole("checkbox", { name: fill(t.report.alsoBlock, { name: "Kabir" }) }));
  await fireEvent.press(screen.getByRole("button", { name: t.report.send }));
  expect(await screen.findByText(t.common.tooMany)).toBeTruthy();
  answer = { status: 201, body: { id: "r1", reason: "fake", about: "profile", subject_name: "Kabir", status: "open", created_at: "2026-11-05T09:00:00Z" } };
  await fireEvent.press(screen.getByRole("button", { name: t.report.send }));
  expect(await screen.findByText(t.report.sent)).toBeTruthy();
  expect(calls.at(-1)?.body).toEqual({ subject_id: "u2", reason: "fake", block: false });
});

test("the Safety screen lists blocks (with unblock) and report statuses", async () => {
  let blocks = [{ user_id: "u2", display_name: "Kabir", blocked_at: "2026-11-05T09:00:00Z" }, { user_id: "u3", display_name: null, blocked_at: "2026-11-05T08:00:00Z" }];
  const { api, calls } = fakeApi({
    "GET /v1/blocks": () => ({ status: 200, body: blocks }),
    "DELETE /v1/blocks/u2": () => {
      blocks = blocks.slice(1);
      return { status: 204 };
    },
    "GET /v1/reports/mine": () => ({
      status: 200,
      body: [{ id: "r1", reason: "scam", about: "message", subject_name: "Kabir", status: "in_review", created_at: "2026-11-05T09:00:00Z" }],
    }),
  });
  await renderWithApp(<SafetyScreen />, api);
  expect(await screen.findByText(`Kabir: ${t.report.reasons.scam}. ${t.safety.status.in_review}`)).toBeTruthy();
  expect(screen.getByText(t.safety.left)).toBeTruthy();
  // Each person is a row that says since when; Unblock asks first, and Cancel sends nothing (MOB-31, D113).
  expect(screen.getAllByText(fill(t.safety.blockedOn, { day: dayInIndia("2026-11-05T09:00:00Z") }))).toHaveLength(2); // both on 5 Nov in India
  const unblockKabir = fill(t.safety.unblockName, { name: "Kabir" });
  await fireEvent.press(screen.getByRole("button", { name: unblockKabir }));
  expect(screen.getByText(fill(t.safety.confirmUnblock, { name: "Kabir" }))).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.common.cancel }));
  expect(screen.queryByText(fill(t.safety.confirmUnblock, { name: "Kabir" }))).toBeNull();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  // Confirmed, the block goes, and the row with it.
  await fireEvent.press(screen.getByRole("button", { name: unblockKabir }));
  await fireEvent.press(screen.getByRole("button", { name: unblockKabir })); // the question's own Unblock
  await waitFor(() => expect(screen.queryByText("Kabir")).toBeNull());
  expect(calls.filter((c) => c.method === "DELETE" && c.path === "/v1/blocks/u2")).toHaveLength(1);
});
