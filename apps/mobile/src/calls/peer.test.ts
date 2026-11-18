/** LIVE-APP-7 (stage 23, D123): the connection asks for relay-only, sends complete descriptions, and reports its state. */
import { GATHER_MS, makeLink, type PeerConnectionCtor } from "@/calls/peer";

type Listener = (event: never) => void;

class FakePeer {
  static last: FakePeer | null = null;
  config: unknown;
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "new";
  localDescription: { sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  tracks: unknown[] = [];
  closed = false;
  private listeners = new Map<string, Set<Listener>>();
  constructor(config: unknown) {
    this.config = config;
    FakePeer.last = this;
  }
  addTrack(track: unknown) {
    this.tracks.push(track);
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0 offer, no candidates yet" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "v=0 answer, no candidates yet" };
  }
  async setLocalDescription(d: { sdp?: string }) {
    this.localDescription = { sdp: d.sdp ?? "" };
    this.iceGatheringState = "gathering";
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
  }
  addEventListener(type: string, l: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(l);
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l);
  }
  fire(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((l) => (l as (e: unknown) => void)(event));
  }
  close() {
    this.closed = true;
  }
}

const Peer = FakePeer as unknown as PeerConnectionCtor;
const camera = { getTracks: () => [{ kind: "video", enabled: true, stop: jest.fn() }, { kind: "audio", enabled: true, stop: jest.fn() }] };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("relay-only, with the call's credentials, and both camera tracks sent", () => {
  makeLink(Peer, { policy: "relay", servers: [{ urls: ["turn:relay.example:3478"], username: "u", credential: "c" }] }, camera);
  expect(FakePeer.last?.config).toEqual({
    iceServers: [{ urls: ["turn:relay.example:3478"], username: "u", credential: "c" }],
    iceTransportPolicy: "relay",
    bundlePolicy: "max-bundle",
  });
  expect(FakePeer.last?.tracks).toHaveLength(2);
});

test("the offer waits for gathering to finish, so it carries every candidate", async () => {
  const link = makeLink(Peer, { policy: "all", servers: [] }, camera);
  const peer = FakePeer.last as FakePeer;
  let sent: string | null = null;
  void link.offer().then((sdp) => (sent = sdp));
  await jest.advanceTimersByTimeAsync(0);
  expect(sent).toBeNull(); // still gathering
  peer.localDescription = { sdp: "v=0 offer with relay candidates" };
  peer.iceGatheringState = "complete";
  peer.fire("icegatheringstatechange");
  await jest.advanceTimersByTimeAsync(0);
  expect(sent).toBe("v=0 offer with relay candidates");
});

test("gathering that never finishes is cut short; the answer takes the offer first", async () => {
  const link = makeLink(Peer, { policy: "all", servers: [] }, camera);
  const peer = FakePeer.last as FakePeer;
  let sent: string | null = null;
  void link.answer("v=0 their offer").then((sdp) => (sent = sdp));
  await jest.advanceTimersByTimeAsync(GATHER_MS);
  expect(peer.remoteDescription).toEqual({ type: "offer", sdp: "v=0 their offer" });
  expect(sent).toBe("v=0 answer, no candidates yet");
});

test("states and the other person's stream reach the session", async () => {
  const link = makeLink(Peer, { policy: "relay", servers: [] }, camera);
  const peer = FakePeer.last as FakePeer;
  const changes = jest.fn();
  link.onChange(changes);
  const stream = { getTracks: () => [] };
  peer.fire("track", { streams: [stream] });
  expect(link.remote).toBe(stream);
  peer.connectionState = "connected";
  peer.fire("connectionstatechange");
  expect(link.state).toBe("connected");
  peer.connectionState = "";
  peer.iceConnectionState = "completed"; // browsers without connectionState
  peer.fire("iceconnectionstatechange");
  expect(link.state).toBe("connected");
  expect(changes).toHaveBeenCalledTimes(2);
  await link.accept("v=0 answer");
  expect(peer.remoteDescription).toEqual({ type: "answer", sdp: "v=0 answer" });
  link.close();
  expect(peer.closed).toBe(true);
});
