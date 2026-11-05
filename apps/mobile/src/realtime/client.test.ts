import { RealtimeClient, type RealtimeOptions, realtimeUrl, type SocketLike } from "@/realtime/client";

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  closedWith: number | undefined;
  constructor(readonly url: string) {}
  close(code?: number) {
    this.closedWith = code;
  }
  say(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  drop(code: number) {
    this.onclose?.({ code });
  }
}

function setup(overrides: Partial<RealtimeOptions> = {}) {
  const sockets: FakeSocket[] = [];
  let tickets = 0;
  const options = {
    getTicket: jest.fn(async () => `ticket-${++tickets}`),
    url: (ticket: string) => realtimeUrl("http://api.test", ticket),
    openSocket: (url: string) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onEvent: jest.fn(),
    onCatchUp: jest.fn(),
    onSessionEnded: jest.fn(),
    onStatus: jest.fn(),
    heartbeatMs: 1000,
    random: () => 0, // the shortest delay of each step
    ...overrides,
  };
  return { client: new RealtimeClient(options), sockets, options };
}

// Let the ticket promise resolve.
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("connects with a fresh ticket, catches up on ready, then passes hints on", async () => {
  const { client, sockets, options } = setup();
  client.start();
  await settle();
  expect(sockets[0]?.url).toBe("ws://api.test/v1/realtime?ticket=ticket-1");
  sockets[0]?.say({ type: "ready" });
  expect(options.onCatchUp).toHaveBeenCalledTimes(1);
  expect(options.onStatus).toHaveBeenLastCalledWith("live");
  sockets[0]?.say({ type: "message.created", match_id: "m1", n: 3 });
  expect(options.onEvent).toHaveBeenCalledWith({ type: "message.created", match_id: "m1", n: 3 });
  sockets[0]?.say({ type: "match.closed", match_id: "m1" });
  expect(options.onEvent).toHaveBeenLastCalledWith({ type: "match.closed", match_id: "m1" });
  sockets[0]?.say({ type: "resync" });
  expect(options.onCatchUp).toHaveBeenCalledTimes(2);
  sockets[0]?.say({ type: "ping" });
  sockets[0]?.say({ type: "something.new" });
  expect(options.onEvent).toHaveBeenCalledTimes(2);
  client.stop();
});

test("reconnects with backoff and a new ticket, growing to 30 seconds", async () => {
  const { client, sockets, options } = setup();
  client.start();
  await settle();
  expect(client.backoffMs()).toBe(500); // attempt 0: half of 1 s with random() = 0
  sockets[0]?.drop(1012);
  expect(options.onStatus).toHaveBeenLastCalledWith("offline");
  jest.advanceTimersByTime(499);
  expect(options.getTicket).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await settle();
  expect(options.getTicket).toHaveBeenCalledTimes(2);
  expect(sockets[1]?.url).toContain("ticket-2");
  for (let i = 0; i < 10; i++) {
    sockets.at(-1)?.drop(1006);
    jest.advanceTimersByTime(30_000);
    await settle();
  }
  expect(client.backoffMs()).toBe(15_000); // capped: half of 30 s
  sockets.at(-1)?.say({ type: "ready" });
  expect(client.backoffMs()).toBe(500); // a good connection resets it
  client.stop();
});

test("the session ending stops it and asks the app to sign out", async () => {
  const { client, sockets, options } = setup();
  client.start();
  await settle();
  sockets[0]?.drop(4401);
  expect(options.onSessionEnded).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(120_000);
  await settle();
  expect(options.getTicket).toHaveBeenCalledTimes(1);
});

test("too many connections waits a minute", async () => {
  const { client, sockets, options } = setup();
  client.start();
  await settle();
  sockets[0]?.drop(4429);
  jest.advanceTimersByTime(59_999);
  await settle();
  expect(options.getTicket).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await settle();
  expect(options.getTicket).toHaveBeenCalledTimes(2);
  client.stop();
});

test("silence for two heartbeats replaces the connection", async () => {
  const { client, sockets } = setup();
  client.start();
  await settle();
  sockets[0]?.say({ type: "ready" });
  jest.advanceTimersByTime(1500);
  sockets[0]?.say({ type: "ping" }); // still alive
  jest.advanceTimersByTime(1999);
  expect(sockets[0]?.closedWith).toBeUndefined();
  jest.advanceTimersByTime(1);
  expect(sockets[0]?.closedWith).toBe(4000);
  jest.advanceTimersByTime(500);
  await settle();
  expect(sockets).toHaveLength(2);
  client.stop();
});

test("a failed ticket request is retried; stop ends everything", async () => {
  const getTicket = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("t");
  const { client, sockets } = setup({ getTicket });
  client.start();
  await settle();
  expect(sockets).toHaveLength(0);
  jest.advanceTimersByTime(500);
  await settle();
  expect(sockets).toHaveLength(1);
  client.stop();
  expect(sockets[0]?.closedWith).toBe(1000);
  sockets[0]?.drop(1000); // the close event after stop() changes nothing
  jest.advanceTimersByTime(60_000);
  await settle();
  expect(sockets).toHaveLength(1);
});

test("the URL follows the API's scheme", () => {
  expect(realtimeUrl("https://api.example.in/", "a b")).toBe("wss://api.example.in/v1/realtime?ticket=a%20b");
  expect(realtimeUrl("http://127.0.0.1:8000", "t")).toBe("ws://127.0.0.1:8000/v1/realtime?ticket=t");
});
