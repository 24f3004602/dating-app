/**
 * One call's connection (stage 23, D123), over the standard WebRTC API: the browser's,
 * or react-native-webrtc's on phones, which has the same shape.
 *
 * - No trickle ICE: each description is sent once, with every candidate in it, after
 *   gathering finishes (or a few seconds pass). Two messages set a call up.
 * - On servers people use the policy is "relay": the device offers only the relay's
 *   address, so the other person never learns its IP (the server checks this too).
 */

export type IceConfig = {
  policy: "relay" | "all";
  servers: { urls: string[]; username?: string | null; credential?: string | null }[];
};

export type LinkState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

/** The parts of a media stream the call uses (a browser MediaStream, or react-native-webrtc's). */
export type StreamLike = {
  getTracks(): { stop(): void; enabled: boolean; kind: string }[];
  toURL?: () => string;
};

/** The parts of RTCPeerConnection the call uses. */
type PeerLike = {
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  localDescription: { sdp: string } | null;
  addTrack(track: unknown, stream: unknown): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: { type: "offer" | "answer"; sdp: string }): Promise<void>;
  addEventListener(type: string, listener: (event: never) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
  close(): void;
};

export type PeerConnectionCtor = new (config: {
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  iceTransportPolicy: "relay" | "all";
  bundlePolicy: "max-bundle";
}) => PeerLike;

export type Link = {
  /** The offerer's description, complete. */
  offer(): Promise<string>;
  /** The answerer's description for an offer, complete. */
  answer(offer: string): Promise<string>;
  /** The offerer takes the answer. */
  accept(answer: string): Promise<void>;
  readonly state: LinkState;
  readonly remote: StreamLike | null;
  /** Called when the state or the remote stream changes. Returns an unsubscribe. */
  onChange(listener: () => void): () => void;
  close(): void;
};

/** The longest a description waits for its candidates. */
export const GATHER_MS = 4000;
/**
 * Enough candidates: once some have come, this long without another. Cloudflare's relays
 * hand out all six of a call's relay candidates within about 150 ms, but Chrome reports
 * gathering complete only about 10 s later (measured 2026-11-19), so waiting for it cost
 * the full cap on both sides of every call.
 */
export const QUIET_MS = 500;

function stateOf(pc: PeerLike): LinkState {
  // connectionState where supported; the ICE state stands in elsewhere.
  const raw = pc.connectionState || pc.iceConnectionState;
  if (raw === "completed") return "connected";
  if (raw === "checking") return "connecting";
  return (["new", "connecting", "connected", "disconnected", "failed", "closed"] as const).find((s) => s === raw) ?? "new";
}

export function makeLink(
  PeerConnection: PeerConnectionCtor,
  ice: IceConfig,
  local: StreamLike,
  gatherMs = GATHER_MS,
  quietMs = QUIET_MS,
): Link {
  const pc = new PeerConnection({
    iceServers: ice.servers.map((s) => ({
      urls: s.urls,
      ...(s.username ? { username: s.username } : {}),
      ...(s.credential ? { credential: s.credential } : {}),
    })),
    iceTransportPolicy: ice.policy,
    bundlePolicy: "max-bundle",
  });
  const listeners = new Set<() => void>();
  let remote: StreamLike | null = null;
  let state: LinkState = "new";
  const emit = () => listeners.forEach((l) => l());

  for (const track of local.getTracks()) pc.addTrack(track, local);
  pc.addEventListener("track", ((event: { streams?: StreamLike[] }) => {
    const stream = event.streams?.[0];
    if (stream && stream !== remote) {
      remote = stream;
      emit();
    }
  }) as (e: never) => void);
  const onState = () => {
    const next = stateOf(pc);
    if (next !== state) {
      state = next;
      emit();
    }
  };
  pc.addEventListener("connectionstatechange", onState);
  pc.addEventListener("iceconnectionstatechange", onState);

  /** The local description once gathering is done, or after `gatherMs` with what there is. */
  // A description without a candidate can't connect (and a relay-only server refuses it).
  // On Android (react-native-webrtc) the side that answers was refused for having none, so
  // gathering "complete" or an end-of-candidates event only counts once candidates are in.
  const hasCandidate = () => /(^|\n)a=candidate:/.test(pc.localDescription?.sdp ?? "");
  const complete = async (): Promise<string> => {
    if (!(pc.iceGatheringState === "complete" && hasCandidate())) {
      await new Promise<void>((resolve) => {
        let quiet: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          clearTimeout(timer);
          clearTimeout(quiet);
          pc.removeEventListener("icegatheringstatechange", onGathering);
          pc.removeEventListener("icecandidate", onCandidate);
          resolve();
        };
        const onGathering = () => {
          if (pc.iceGatheringState === "complete" && hasCandidate()) finish();
        };
        // Each candidate restarts the quiet period; the end-of-candidates event finishes at once.
        const onCandidate = ((event: { candidate: unknown }) => {
          if (!event.candidate) {
            if (hasCandidate()) finish();
            return;
          }
          clearTimeout(quiet);
          quiet = setTimeout(finish, quietMs);
        }) as (e: never) => void;
        const timer = setTimeout(finish, gatherMs);
        pc.addEventListener("icegatheringstatechange", onGathering);
        pc.addEventListener("icecandidate", onCandidate);
        // Candidates that came before these listeners count: the quiet period starts now.
        if (hasCandidate()) quiet = setTimeout(finish, quietMs);
      });
    }
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("no local description");
    return sdp;
  };

  return {
    async offer() {
      await pc.setLocalDescription(await pc.createOffer());
      return complete();
    },
    async answer(offer: string) {
      await pc.setRemoteDescription({ type: "offer", sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      return complete();
    },
    async accept(answer: string) {
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    },
    get state() {
      return state;
    },
    get remote() {
      return remote;
    },
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      pc.close();
    },
  };
}
