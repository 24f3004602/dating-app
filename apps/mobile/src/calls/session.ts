/**
 * A Live session (stage 23, D123): the camera, the wait in the queue, one call at a time.
 *
 * idle → camera → searching → connecting → live → ended → (Next) searching …
 *
 * The server decides who meets whom and how long a call may run; the device follows.
 * - searching: a heartbeat every few seconds keeps the place in the queue and pairs at
 *   once if someone suitable is waiting; a realtime hint brings a pairing sooner.
 * - connecting: relay credentials, then the offer (the one who waited) or the answer.
 *   The other side's description arrives by hint, or by polling every 1.5 s.
 * - live: the device reports the connection and the server starts the clock; the device
 *   hangs up when time runs out, and polls every 5 s in case the other side has left.
 * - ended: a summary, with Like and Next.
 *
 * Every step checks a generation number, so work from a call that has ended (or a
 * session that stopped) never touches the next one.
 */
import { ApiError, type Schemas } from "@/api/client";
import type { IceConfig, Link, StreamLike } from "@/calls/peer";

export type CallOut = Schemas["CallOut"];
export type QueueOut = Schemas["QueueOut"];
export type EndReason = Schemas["EndIn"]["reason"];

export type LiveApi = {
  queue(clientId: string): Promise<QueueOut>;
  leave(): Promise<void>;
  call(id: string): Promise<CallOut>;
  ice(id: string): Promise<IceConfig>;
  offer(id: string, sdp: string): Promise<CallOut>;
  answer(id: string, sdp: string): Promise<CallOut>;
  connected(id: string): Promise<CallOut>;
  end(id: string, reason: EndReason): Promise<CallOut>;
};

export type LiveRtc = {
  openCamera(): Promise<StreamLike>;
  link(ice: IceConfig, camera: StreamLike): Link;
};

export type Phase = "idle" | "camera" | "searching" | "connecting" | "live" | "ended";

export type LiveState = {
  phase: Phase;
  camera: StreamLike | null;
  remote: StreamLike | null;
  call: CallOut | null;
  /** When the call's time runs out, on this device's clock (ms). */
  endsAt: number | null;
  /** Why the session stopped or a call didn't happen: a code the screen puts into words. */
  problem: string | null;
};

export const CONNECTING_POLL_MS = 1500;
export const LIVE_POLL_MS = 5000;
export const CONNECT_TIMEOUT_MS = 30_000;
/** A connection that drops comes back within this, or the call is over. */
export const DROP_GRACE_MS = 6000;
const RETRY_MS = 5000;

const INITIAL: LiveState = { phase: "idle", camera: null, remote: null, call: null, endsAt: null, problem: null };

function cameraProblem(err: unknown): string {
  const name = err instanceof Error || (typeof err === "object" && err !== null) ? (err as { name?: string }).name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError") return "camera_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "no_camera";
  return "camera_failed";
}

function codeOf(err: unknown): string {
  return err instanceof ApiError ? err.code : "unknown";
}

type Deps = { api: LiveApi; rtc: LiveRtc; clientId: string; now?: () => number };

export class LiveSession {
  private state: LiveState = INITIAL;
  private readonly listeners = new Set<(s: LiveState) => void>();
  private generation = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private link: Link | null = null;
  private unlink: (() => void) | null = null;
  private reported = false;
  private answered = false;
  private accepted = false;
  private skew = 0;
  private readonly now: () => number;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? Date.now;
  }

  getState(): LiveState {
    return this.state;
  }

  subscribe(listener: (s: LiveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<LiveState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private later(gen: number, ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (gen === this.generation) run();
    }, ms);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  private closeLink(): void {
    this.unlink?.();
    this.unlink = null;
    this.link?.close();
    this.link = null;
  }

  private stopCamera(): void {
    this.state.camera?.getTracks().forEach((track) => track.stop());
    this.set({ camera: null });
  }

  /** A new generation: whatever the last call or wait was doing stops mattering. */
  private fresh(): number {
    this.generation += 1;
    this.clearTimers();
    this.closeLink();
    this.reported = false;
    this.answered = false;
    this.accepted = false;
    return this.generation;
  }

  // --- the wait ------------------------------------------------------------------

  /** Turn the camera on and look for someone. */
  async start(): Promise<void> {
    if (this.state.phase !== "idle" && this.state.phase !== "ended") return;
    this.set({ problem: null });
    if (!this.state.camera) {
      const gen = this.fresh();
      this.set({ phase: "camera" });
      try {
        const camera = await this.deps.rtc.openCamera();
        if (gen !== this.generation) {
          camera.getTracks().forEach((track) => track.stop()); // stopped meanwhile
          return;
        }
        this.set({ camera });
      } catch (err) {
        if (gen === this.generation) this.set({ phase: "idle", problem: cameraProblem(err) });
        return;
      }
    }
    this.search();
  }

  private search(): void {
    const gen = this.fresh();
    this.set({ phase: "searching", call: null, remote: null, endsAt: null, problem: null });
    void this.beat(gen);
  }

  private async beat(gen: number): Promise<void> {
    try {
      const out = await this.deps.api.queue(this.deps.clientId);
      if (gen !== this.generation) return;
      if (out.state === "paired" && out.call) {
        this.paired(out.call, gen);
        return;
      }
      this.later(gen, Math.max(1, out.retry_after_s) * 1000, () => void this.beat(gen));
    } catch (err) {
      if (gen !== this.generation) return;
      const code = codeOf(err);
      if (code === "network_error" || code === "rate_limited") {
        this.later(gen, RETRY_MS, () => void this.beat(gen));
        return;
      }
      // Not ready (no calls left, on hold, ...): back to the Live screen, which says why.
      this.fresh();
      this.stopCamera();
      this.set({ phase: "idle", problem: code });
    }
  }

  // --- a call ---------------------------------------------------------------------

  private paired(call: CallOut, gen: number): void {
    if (call.client_id !== this.deps.clientId) {
      this.fresh();
      this.stopCamera();
      this.set({ phase: "idle", call: null, problem: "other_device" });
      return;
    }
    this.skew = Date.parse(call.server_now) - this.now();
    this.set({ phase: "connecting", call, remote: null, endsAt: null });
    this.later(gen, CONNECT_TIMEOUT_MS, () => {
      if (this.state.phase === "connecting") void this.hangUp("failed");
    });
    void this.prepare(call, gen);
  }

  private async prepare(call: CallOut, gen: number): Promise<void> {
    const camera = this.state.camera;
    try {
      const ice = await this.deps.api.ice(call.id);
      if (gen !== this.generation || !camera) return;
      const link = this.deps.rtc.link(ice, camera);
      this.link = link;
      this.unlink = link.onChange(() => this.linkChanged(gen));
      if (call.role === "offerer") {
        const sdp = await link.offer();
        if (gen !== this.generation) return;
        await this.apply(await this.deps.api.offer(call.id, sdp), gen);
      } else {
        await this.apply(await this.deps.api.call(call.id), gen);
      }
      this.poll(gen);
    } catch (err) {
      if (gen === this.generation) void this.hangUp("failed", codeOf(err));
    }
  }

  private poll(gen: number): void {
    const every = this.state.phase === "live" ? LIVE_POLL_MS : CONNECTING_POLL_MS;
    this.later(gen, every, () => void this.refresh(gen).finally(() => gen === this.generation && this.poll(gen)));
  }

  private async refresh(gen: number): Promise<void> {
    const call = this.state.call;
    if (!call) return;
    try {
      await this.apply(await this.deps.api.call(call.id), gen);
    } catch {
      // the next poll tries again; the server ends the call by itself if need be
    }
  }

  /** A fresh copy of the call from the server: act on what changed. */
  private async apply(call: CallOut, gen: number): Promise<void> {
    if (gen !== this.generation) return;
    this.skew = Date.parse(call.server_now) - this.now();
    this.set({ call, endsAt: call.ends_at ? Date.parse(call.ends_at) - this.skew : null });
    if (call.state === "ended") {
      this.over(gen);
      return;
    }
    const link = this.link;
    if (!link) return;
    if (call.role === "answerer" && call.offer_sdp && !this.answered) {
      this.answered = true;
      const sdp = await link.answer(call.offer_sdp);
      if (gen !== this.generation) return;
      await this.apply(await this.deps.api.answer(call.id, sdp), gen);
    } else if (call.role === "offerer" && call.answer_sdp && !this.accepted) {
      this.accepted = true;
      await link.accept(call.answer_sdp);
    }
  }

  private linkChanged(gen: number): void {
    const link = this.link;
    if (!link || gen !== this.generation) return;
    if (link.remote !== this.state.remote) this.set({ remote: link.remote });
    if (link.state === "connected") {
      if (!this.reported) {
        this.reported = true;
        void this.reportConnected(gen);
      }
    } else if (link.state === "failed") {
      void this.hangUp("failed");
    } else if (link.state === "disconnected" && this.state.phase === "live") {
      this.later(gen, DROP_GRACE_MS, () => {
        if (this.link?.state !== "connected") void this.hangUp("failed");
      });
    }
  }

  private async reportConnected(gen: number): Promise<void> {
    const call = this.state.call;
    if (!call) return;
    try {
      const live = await this.deps.api.connected(call.id);
      if (gen !== this.generation) return;
      await this.apply(live, gen);
      if (live.state !== "live" || gen !== this.generation) return;
      this.set({ phase: "live" });
      const left = (this.state.endsAt ?? this.now()) - this.now();
      this.later(gen, Math.max(0, left), () => void this.hangUp("limit"));
    } catch (err) {
      if (gen === this.generation) void this.hangUp("failed", codeOf(err));
    }
  }

  /** The server says the call has ended (the other person left, or time ran out). */
  private over(gen: number): void {
    if (gen !== this.generation) return;
    this.fresh();
    this.set({ phase: "ended", remote: null, endsAt: null });
  }

  // --- the person's choices ---------------------------------------------------------

  /** End the current call (End, Report, or time up). Waiting? Stop waiting. */
  async hangUp(reason: EndReason = "hangup", problem: string | null = null): Promise<void> {
    const { phase, call } = this.state;
    if (phase === "searching" || phase === "camera") {
      this.fresh();
      this.set({ phase: "idle", problem });
      await this.deps.api.leave().catch(() => undefined);
      return;
    }
    if ((phase !== "connecting" && phase !== "live") || !call) return;
    const gen = this.fresh();
    this.set({ phase: "ended", remote: null, endsAt: null, problem });
    try {
      const ended = await this.deps.api.end(call.id, reason);
      if (gen === this.generation) this.set({ call: ended });
    } catch {
      // The server ends it by itself: the connection timeout or the time limit.
    }
  }

  /** Move on to the next person. */
  async next(): Promise<void> {
    if (this.state.phase === "connecting" || this.state.phase === "live") await this.hangUp("next");
    if (this.state.phase === "ended") {
      if (this.state.camera) this.search();
      else await this.start();
    }
  }

  /** Leave Live: end any call, stop waiting, turn the camera off. */
  stop(): void {
    const { phase, call } = this.state;
    this.fresh();
    if (phase === "searching") void this.deps.api.leave().catch(() => undefined);
    if ((phase === "connecting" || phase === "live") && call) void this.deps.api.end(call.id, "hangup").catch(() => undefined);
    this.stopCamera();
    this.set({ ...INITIAL });
  }

  /** A realtime hint: something about a call changed. */
  onCallUpdated(callId: string): void {
    const gen = this.generation;
    if (this.state.phase === "searching") {
      this.fresh();
      void this.beat(this.generation); // paired with someone who joined: ask now
    } else if (this.state.call?.id === callId && (this.state.phase === "connecting" || this.state.phase === "live")) {
      void this.refresh(gen);
    }
  }
}
