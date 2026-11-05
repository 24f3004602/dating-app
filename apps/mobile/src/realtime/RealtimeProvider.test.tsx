import { act, screen, waitFor } from "@testing-library/react-native";

import type { SocketLike } from "@/realtime/client";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { ChatScreen } from "@/screens/chat";
import { fakeApi } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(readonly url: string) {}
  close() {}
  say(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

test("a hint refreshes the open conversation: the new message appears without a reload", async () => {
  const sockets: FakeSocket[] = [];
  const openSocket = (url: string) => {
    const s = new FakeSocket(url);
    sockets.push(s);
    return s;
  };
  let items: object[] = [{ id: "a", n: 1, from_me: true, body: "Holi plans?", sent_at: "2026-11-05T09:00:00Z", client_message_id: "c1", safety_tip: null }];
  const { api, calls } = fakeApi({
    "POST /v1/realtime/ticket": () => ({ status: 201, body: { ticket: "tk", expires_in: 30 } }),
    "GET /v1/matches/m1": () => ({
      status: 200,
      body: { id: "m1", matched_at: "2026-11-05T09:00:00Z", unread: 0, your_turn: false, last_message: null,
              person: { user_id: "u2", display_name: "Kabir", age: 29, photo: null } },
    }), // prettier-ignore
    "GET /v1/matches/m1/messages": () => ({ status: 200, body: { items, has_more: false } }),
    "GET /v1/safety/nudge-terms": () => ({ status: 200, body: { version: "t", hurtful: [], money: [] } }),
    "POST /v1/matches/m1/read": () => ({ status: 200, body: { last_read_n: 2, unread: 0 } }),
  });
  await renderWithApp(
    <RealtimeProvider openSocket={openSocket}>
      <ChatScreen matchId="m1" />
    </RealtimeProvider>,
    api,
  );
  expect(await screen.findByText("Holi plans?")).toBeTruthy();
  await waitFor(() => expect(sockets).toHaveLength(1));
  expect(sockets[0]?.url).toMatch(/\/v1\/realtime\?ticket=tk$/);
  await act(async () => sockets[0]?.say({ type: "ready" }));

  items = [...items, { id: "b", n: 2, from_me: false, body: "Colours at Lodhi Garden!", sent_at: "2026-11-05T09:01:00Z", client_message_id: null, safety_tip: null }];
  const before = calls.filter((c) => c.path === "/v1/matches/m1/messages").length;
  await act(async () => sockets[0]?.say({ type: "message.created", match_id: "m1", n: 2 }));
  expect(await screen.findByText("Colours at Lodhi Garden!")).toBeTruthy();
  expect(calls.filter((c) => c.path === "/v1/matches/m1/messages").length).toBeGreaterThan(before);
  await screen.unmount();
});
