import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { t } from "@/i18n/en";
import { ChatScreen } from "@/screens/chat";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const match = (unread = 0) => ({
  status: 200,
  body: {
    id: "m1", matched_at: "2026-11-05T09:00:00Z", unread, your_turn: unread > 0, last_message: null,
    person: { user_id: "u2", display_name: "Kabir", age: 29, photo: null },
  },
}); // prettier-ignore
const msg = (n: number, fromMe: boolean, body: string, extra: object = {}) => ({
  id: `id${n}`, n, from_me: fromMe, body, sent_at: "2026-11-05T09:00:00Z",
  client_message_id: fromMe ? `c${n}` : null, safety_tip: null, ...extra,
}); // prettier-ignore
const terms = { status: 200, body: { version: "t", hurtful: ["idiot"], money: ["upi"] } };

function routes(messages: object[], overrides: Record<string, unknown> = {}) {
  return {
    "GET /v1/matches/m1": () => match(),
    "GET /v1/matches/m1/messages": () => ({ status: 200, body: { items: messages, has_more: false } }),
    "GET /v1/safety/nudge-terms": () => terms,
    "POST /v1/matches/m1/read": () => ({ status: 200, body: { last_read_n: 1, unread: 0 } }),
    ...overrides,
  } as Parameters<typeof fakeApi>[0];
}

test("history, whose message is whose, and the money safety tip", async () => {
  const { api } = fakeApi(
    routes([msg(1, false, "Hi! Send it on UPI?", { safety_tip: "money" }), msg(2, true, "Let's meet first")]),
  );
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  expect(await screen.findByText("Hi! Send it on UPI?")).toBeTruthy();
  expect(screen.getByText("Kabir · 14:30")).toBeTruthy(); // India time
  expect(screen.getByText("You · 14:30")).toBeTruthy();
  expect(screen.getAllByText(t.chat.moneyTip)).toHaveLength(1);
});

test("an empty conversation says how messages are stored", async () => {
  const { api } = fakeApi(routes([]));
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  expect(await screen.findByText(/Say hello to Kabir\. .*not end-to-end encrypted\./)).toBeTruthy();
});

test("sending uses a fresh client ID and shows the message until it is confirmed", async () => {
  let stored: object[] = [];
  const { api, calls } = fakeApi(
    routes([], {
      "GET /v1/matches/m1/messages": () => ({ status: 200, body: { items: stored, has_more: false } }),
      "POST /v1/matches/m1/messages": (req: { body: { client_message_id: string; body: string } }) => {
        stored = [{ ...msg(1, true, req.body.body), client_message_id: req.body.client_message_id }];
        return { status: 201, body: stored[0] };
      },
    }),
  );
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  await fireEvent.changeText(await screen.findByLabelText(t.chat.message), "  Holi plans?  ");
  await fireEvent.press(screen.getByRole("button", { name: t.chat.send }));
  const sent = calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"));
  expect(sent?.body).toEqual({ client_message_id: expect.stringMatching(UUID), body: "Holi plans?" });
  await waitFor(() => expect(screen.getByText("You · 14:30")).toBeTruthy()); // the stored copy replaced "Sending"
  expect(screen.getAllByText("Holi plans?")).toHaveLength(1);
});

test("a failed send can be retried with the same client ID", async () => {
  let fail = true;
  const { api, calls } = fakeApi(
    routes([], {
      "POST /v1/matches/m1/messages": () => (fail ? problem(503, "unavailable") : { status: 201, body: msg(1, true, "Hello") }),
    }),
  );
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  await fireEvent.changeText(await screen.findByLabelText(t.chat.message), "Hello");
  await fireEvent.press(screen.getByRole("button", { name: t.chat.send }));
  expect(await screen.findByText(t.chat.notSent)).toBeTruthy();
  fail = false;
  await fireEvent.press(screen.getByRole("button", { name: t.chat.retry }));
  await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages"))).toHaveLength(2));
  const [first, second] = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages"));
  expect((second?.body as { client_message_id: string }).client_message_id).toBe(
    (first?.body as { client_message_id: string }).client_message_id,
  );
});

test("a hurtful word asks before sending, and nothing is sent until confirmed", async () => {
  const { api, calls } = fakeApi(
    routes([], { "POST /v1/matches/m1/messages": () => ({ status: 201, body: msg(1, true, "you idiot") }) }),
  );
  const posts = () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages"));
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  await screen.findByText(/Say hello/);
  await waitFor(() => expect(calls.some((c) => c.path === "/v1/safety/nudge-terms")).toBe(true));
  await fireEvent.changeText(screen.getByLabelText(t.chat.message), "you IDIOT");
  await fireEvent.press(screen.getByRole("button", { name: t.chat.send }));
  expect(await screen.findByText(t.chat.nudge)).toBeTruthy();
  expect(posts()).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: t.chat.edit }));
  expect(screen.queryByText(t.chat.nudge)).toBeNull();
  expect(screen.getByLabelText(t.chat.message).props.value).toBe("you IDIOT"); // kept for editing
  await fireEvent.press(screen.getByRole("button", { name: t.chat.send }));
  await fireEvent.press(await screen.findByRole("button", { name: t.chat.sendAnyway }));
  await waitFor(() => expect(posts()).toHaveLength(1));
});

test("unread messages are marked read up to the latest", async () => {
  const { api, calls } = fakeApi(routes([msg(1, false, "Hey"), msg(2, false, "Free on Sunday?")], { "GET /v1/matches/m1": () => match(2) }));
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  await waitFor(() => expect(calls.find((c) => c.path === "/v1/matches/m1/read")?.body).toEqual({ up_to_n: 2 }));
});

test("older messages load on request", async () => {
  const { api, calls } = fakeApi(
    routes([], {
      "GET /v1/matches/m1/messages": (req: { query: URLSearchParams }) =>
        req.query.get("before") === "3"
          ? { status: 200, body: { items: [msg(1, false, "first"), msg(2, true, "second")], has_more: false } }
          : { status: 200, body: { items: [msg(3, false, "third")], has_more: true } },
    }),
  );
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  await fireEvent.press(await screen.findByRole("button", { name: t.chat.earlier }));
  expect(await screen.findByText("first")).toBeTruthy();
  expect(calls.filter((c) => c.path === "/v1/matches/m1/messages").map((c) => c.query.get("before"))).toEqual([null, "3"]);
  expect(screen.queryByRole("button", { name: t.chat.earlier })).toBeNull();
});

test("a conversation that has gone says so", async () => {
  const { api } = fakeApi(routes([], { "GET /v1/matches/m1": () => problem(404, "not_found") }));
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  expect(await screen.findByText(t.chat.gone)).toBeTruthy();
});

test("a removed message shows as removed, and the safety actions are there", async () => {
  const { api } = fakeApi(routes([msg(1, false, "", { removed: true }), msg(2, false, "Still here")]));
  await renderWithApp(<ChatScreen matchId="m1" />, api);
  expect(await screen.findByText(t.chat.removed)).toBeTruthy();
  for (const name of [t.chat.unmatch, t.chat.block, t.chat.report]) {
    expect(screen.getByRole("button", { name })).toBeTruthy();
  }
});
