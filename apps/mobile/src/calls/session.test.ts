/**
 * LIVE-APP-1..6 (stage 23, D123): a Live session against a fake API and a fake connection.
 * The camera, the wait, the offer and the answer, the clock, the other side leaving, the
 * free calls running out, and stopping (camera off, the server told).
 */
import { ApiError } from "@/api/client";
import type { IceConfig, Link, LinkState, StreamLike } from "@/calls/peer";
import {
  type CallOut,
  CONNECT_TIMEOUT_MS,
  type LiveApi,
  type LiveRtc,
  LiveSession,
  type LiveState,
  type QueueOut,
} from "@/calls/session";

const ME = "device-mine-0001";
const T0 = Date.parse("2026-11-18T09:00:00Z");

function call(over: Partial<CallOut> = {}): CallOut {
  return {
    id: "call-1", role: "offerer", client_id: ME, state: "connecting",
    peer: { user_id: "user-meera", display_name: "Meera", age: 27 },
    limit_s: 60, free: true, offer_sdp: null, answer_sdp: null,
    connected_at: null, ends_at: null, ended_at: null, end_reason: null,
    server_now: new Date(Date.now()).toISOString(), ...over,
  }; // prettier-ignore
}

class FakeLink implements Link {
  state: LinkState = "new";
  remote: StreamLike | null = null;
  closed = false;
  answered: string | null = null;
  accepted: string | null = null;
  private listeners = new Set<() => void>();
  async offer() {
    return "v=0 offer";
  }
  async answer(offer: string) {
    this.answered = offer;
    return "v=0 answer";
  }
  async accept(answer: string) {
    this.accepted = answer;
  }
  onChange(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  close() {
    this.closed = true;
  }
  become(state: LinkState) {
    this.state = state;
    if (state === "connected") this.remote = { getTracks: () => [] };
    this.listeners.forEach((l) => l());
  }
}

function camera() {
  const stopped: string[] = [];
  const stream: StreamLike = { getTracks: () => [{ kind: "video", enabled: true, stop: () => stopped.push("video") }] };
  return { stream, stopped };
}

function setup(api: Partial<LiveApi>, rtc: Partial<LiveRtc> = {}) {
  const cam = camera();
  const links: FakeLink[] = [];
  const full: LiveApi = {
    queue: jest.fn(async (): Promise<QueueOut> => ({ state: "waiting", call: null, retry_after_s: 4 })),
    leave: jest.fn(async () => undefined),
    call: jest.fn(async () => call()),
    ice: jest.fn(async (): Promise<IceConfig> => ({ policy: "relay", servers: [] })),
    offer: jest.fn(async () => call({ offer_sdp: null })),
    answer: jest.fn(async () => call({ role: "answerer", offer_sdp: "v=0 offer", answer_sdp: null })),
    connected: jest.fn(async () => call({ state: "live", connected_at: new Date(Date.now()).toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString() })),
    end: jest.fn(async (_id: string, reason: string) => call({ state: "ended", end_reason: reason as CallOut["end_reason"], ended_at: new Date(Date.now()).toISOString() })),
    ...api,
  };
  const session = new LiveSession({
    api: full,
    clientId: ME,
    rtc: {
      openCamera: jest.fn(async () => cam.stream),
      link: jest.fn((_ice: IceConfig, _camera: StreamLike) => {
        const link = new FakeLink();
        links.push(link);
        return link;
      }),
      ...rtc,
    },
  });
  const phases: string[] = [];
  session.subscribe((s: LiveState) => {
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
  });
  return { session, api: full, links, cam, phases };
}

/** Let promises settle, timers included (fake timers). */
async function flush(ms = 0) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
});
afterEach(() => {
  jest.useRealTimers();
});

test("LIVE-APP-1: the one who waited makes the offer, takes the answer, and the clock runs to the end", async () => {
  let answer: string | null = null;
  const { session, api, links, phases } = setup({
    queue: jest
      .fn()
      .mockResolvedValueOnce({ state: "waiting", call: null, retry_after_s: 4 })
      .mockImplementation(async () => ({ state: "paired", call: call(), retry_after_s: 0 })),
    call: jest.fn(async () => call({ answer_sdp: answer })),
  });
  await session.start();
  await flush();
  expect(session.getState().phase).toBe("searching");
  await flush(4000); // the heartbeat pairs
  expect(api.ice).toHaveBeenCalledWith("call-1");
  expect(api.offer).toHaveBeenCalledWith("call-1", "v=0 offer");
  answer = "v=0 answer";
  await flush(1500); // the poll brings the answer
  expect(links[0]?.accepted).toBe("v=0 answer");
  links[0]?.become("connected");
  await flush();
  expect(api.connected).toHaveBeenCalledWith("call-1");
  const state = session.getState();
  expect(state.phase).toBe("live");
  expect(state.remote).not.toBeNull();
  expect(state.endsAt).toBe(Date.now() + 60_000);
  await flush(60_000); // time's up: the device hangs up
  expect(api.end).toHaveBeenCalledWith("call-1", "limit");
  expect(session.getState().phase).toBe("ended");
  expect(links[0]?.closed).toBe(true);
  expect(phases).toEqual(["idle", "camera", "searching", "connecting", "live", "ended"]);
});

test("LIVE-APP-2: the one who joined answers the offer once it is in", async () => {
  let offer: string | null = null;
  const { session, api, links } = setup({
    queue: jest.fn(async () => ({ state: "paired" as const, call: call({ role: "answerer" }), retry_after_s: 0 })),
    call: jest.fn(async () => call({ role: "answerer", offer_sdp: offer })),
  });
  await session.start();
  await flush();
  expect(session.getState().phase).toBe("connecting");
  expect(api.answer).not.toHaveBeenCalled();
  offer = "v=0 offer";
  session.onCallUpdated("call-1"); // the realtime hint: no need to wait for the poll
  await flush();
  expect(links[0]?.answered).toBe("v=0 offer");
  expect(api.answer).toHaveBeenCalledWith("call-1", "v=0 answer");
  expect(api.answer).toHaveBeenCalledTimes(1);
  await flush(3000);
  expect(api.answer).toHaveBeenCalledTimes(1); // polls don't answer twice
});

test("LIVE-APP-3: the other side leaving ends the call; a call that never connects is given up", async () => {
  let ended = false;
  const { session, api, links } = setup({
    queue: jest.fn(async () => ({ state: "paired" as const, call: call(), retry_after_s: 0 })),
    call: jest.fn(async () => (ended ? call({ state: "ended", end_reason: "hangup" }) : call())),
  });
  await session.start();
  await flush();
  ended = true;
  await flush(1500);
  expect(session.getState().phase).toBe("ended");
  expect(links[0]?.closed).toBe(true);
  expect(api.end).not.toHaveBeenCalled(); // the server already knows

  ended = false;
  await session.next();
  await flush(CONNECT_TIMEOUT_MS);
  expect(api.end).toHaveBeenLastCalledWith("call-1", "failed");
  expect(session.getState().phase).toBe("ended");
});

test("LIVE-APP-4: with no calls left the camera goes off and the reason comes back", async () => {
  const { session, cam } = setup({
    queue: jest.fn(async () => {
      throw new ApiError(409, "live_no_calls_left");
    }),
  });
  await session.start();
  await flush();
  expect(session.getState()).toMatchObject({ phase: "idle", problem: "live_no_calls_left", camera: null });
  expect(cam.stopped).toEqual(["video"]);
});

test("LIVE-APP-5: a refused camera says so, and nothing reaches the server", async () => {
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  const { session, api } = setup({}, { openCamera: jest.fn(async () => Promise.reject(denied)) });
  await session.start();
  await flush();
  expect(session.getState()).toMatchObject({ phase: "idle", problem: "camera_denied" });
  expect(api.queue).not.toHaveBeenCalled();
});

test("LIVE-APP-6: stopping leaves the queue or ends the call, and turns the camera off", async () => {
  const waiting = setup({});
  await waiting.session.start();
  await flush();
  waiting.session.stop();
  expect(waiting.api.leave).toHaveBeenCalledTimes(1);
  expect(waiting.cam.stopped).toEqual(["video"]);
  await flush(10_000);
  expect(waiting.api.queue).toHaveBeenCalledTimes(1); // no heartbeat after stopping

  const calling = setup({ queue: jest.fn(async () => ({ state: "paired" as const, call: call(), retry_after_s: 0 })) });
  await calling.session.start();
  await flush();
  calling.session.stop();
  expect(calling.api.end).toHaveBeenCalledWith("call-1", "hangup");
  expect(calling.links[0]?.closed).toBe(true);
  expect(calling.session.getState().phase).toBe("idle");
});

test("a call given to another device of yours isn't taken here", async () => {
  const { session, api } = setup({
    queue: jest.fn(async () => ({ state: "paired" as const, call: call({ client_id: "device-other-0001" }), retry_after_s: 0 })),
  });
  await session.start();
  await flush();
  expect(session.getState()).toMatchObject({ phase: "idle", problem: "other_device" });
  expect(api.ice).not.toHaveBeenCalled();
});

test("muting and turning the camera off change only that kind of track, and a new camera starts on", async () => {
  const tracks = { audio: { kind: "audio", enabled: true, stop: jest.fn() }, video: { kind: "video", enabled: true, stop: jest.fn() } };
  const stream = { getTracks: () => [tracks.audio, tracks.video] };
  const { session } = setup({}, { openCamera: jest.fn(async () => stream) });
  await session.start();
  await flush();
  session.setMic(false);
  expect([tracks.audio.enabled, tracks.video.enabled, session.getState().micOn]).toEqual([false, true, false]);
  session.setCamera(false);
  expect([tracks.audio.enabled, tracks.video.enabled, session.getState().cameraOn]).toEqual([false, false, false]);
  session.setMic(true);
  expect([tracks.audio.enabled, session.getState().micOn]).toEqual([true, true]);
  session.stop();
  expect(session.getState()).toMatchObject({ micOn: true, cameraOn: true, camera: null });
});

test("LIVE-APP-17: the phone's call sound starts with the camera and stops with it", async () => {
  const callAudio = { start: jest.fn(), stop: jest.fn() };
  const { session } = setup({}, { callAudio });
  await session.start();
  await flush();
  expect(callAudio.start).toHaveBeenCalledTimes(1);
  expect(callAudio.stop).not.toHaveBeenCalled();
  session.stop();
  expect(callAudio.stop).toHaveBeenCalledTimes(1);
  session.stop(); // nothing on: nothing to put back
  expect(callAudio.stop).toHaveBeenCalledTimes(1);

  const refused = { start: jest.fn(), stop: jest.fn() };
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  const second = setup({}, { openCamera: jest.fn(async () => Promise.reject(denied)), callAudio: refused });
  await second.session.start();
  await flush();
  expect(refused.start).not.toHaveBeenCalled(); // no camera, no call sound
});
