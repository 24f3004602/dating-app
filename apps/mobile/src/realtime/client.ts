/**
 * The realtime connection (D074). The WebSocket only says *that* something
 * changed; the app refetches over REST, which stays the source of truth.
 *
 * - Every connection starts with a fresh single-use ticket.
 * - On `ready` (and on `resync`) the app catches up over REST: anything sent
 *   while it was offline is fetched then.
 * - It reconnects with exponential backoff and jitter (1 s up to 30 s), waits
 *   a minute after 4429 (too many connections), and stops on 4401 (the
 *   session ended) so the app can sign out.
 * - If nothing arrives for two heartbeat intervals the connection is assumed
 *   dead and replaced.
 */

export type RealtimeEvent =
  | { type: "message.created"; match_id: string; n: number }
  | { type: "match.created"; match_id: string }
  | { type: "read.updated"; match_id: string; last_read_n: number };

export type RealtimeStatus = "connecting" | "live" | "offline";

export type SocketLike = {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close: (code?: number) => void;
};

export type RealtimeOptions = {
  getTicket: () => Promise<string>;
  url: (ticket: string) => string;
  openSocket: (url: string) => SocketLike;
  onEvent: (event: RealtimeEvent) => void;
  /** Connected (or told hints were lost): refetch what is on screen. */
  onCatchUp: () => void;
  onSessionEnded: () => void;
  onStatus?: (status: RealtimeStatus) => void;
  heartbeatMs?: number;
  random?: () => number;
};

export const CLOSE_SESSION_ENDED = 4401;
export const CLOSE_TOO_MANY = 4429;
const MAX_BACKOFF_MS = 30_000;
const TOO_MANY_WAIT_MS = 60_000;

export class RealtimeClient {
  private socket: SocketLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private running = false;
  private readonly heartbeatMs: number;
  private readonly random: () => number;

  constructor(private readonly options: RealtimeOptions) {
    this.heartbeatMs = options.heartbeatMs ?? 25_000;
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
    this.options.onStatus?.("offline");
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.retryTimer = null;
    this.silenceTimer = null;
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.options.onStatus?.("connecting");
    let ticket: string;
    try {
      ticket = await this.options.getTicket();
    } catch {
      this.retry();
      return;
    }
    if (!this.running) return;
    const socket = this.options.openSocket(this.options.url(ticket));
    this.socket = socket;
    socket.onmessage = (ev) => this.receive(socket, ev.data);
    socket.onclose = (ev) => this.closed(socket, ev.code);
    socket.onerror = () => undefined; // a close event always follows
    this.watchSilence(socket);
  }

  private watchSilence(socket: SocketLike): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.socket === socket) {
        this.socket = null;
        socket.onclose = null;
        socket.close(4000);
        this.retry();
      }
    }, this.heartbeatMs * 2);
  }

  private receive(socket: SocketLike, data: unknown): void {
    if (this.socket !== socket) return;
    this.watchSilence(socket);
    let event: { type?: string } & Record<string, unknown>;
    try {
      event = JSON.parse(String(data)) as typeof event;
    } catch {
      return;
    }
    if (event.type === "ready") {
      this.attempts = 0;
      this.options.onStatus?.("live");
      this.options.onCatchUp();
    } else if (event.type === "resync") {
      this.options.onCatchUp();
    } else if (event.type === "message.created" || event.type === "match.created" || event.type === "read.updated") {
      this.options.onEvent(event as RealtimeEvent);
    }
    // `ping` only resets the silence timer.
  }

  private closed(socket: SocketLike, code: number): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (!this.running) return;
    if (code === CLOSE_SESSION_ENDED) {
      this.running = false;
      this.options.onStatus?.("offline");
      this.options.onSessionEnded();
      return;
    }
    this.retry(code === CLOSE_TOO_MANY ? TOO_MANY_WAIT_MS : undefined);
  }

  /** The delay before the next attempt: exponential, half of it random (spreads reconnect storms). */
  backoffMs(): number {
    const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts);
    return Math.round(ceiling / 2 + (this.random() * ceiling) / 2);
  }

  private retry(wait?: number): void {
    if (!this.running) return;
    this.options.onStatus?.("offline");
    const delay = wait ?? this.backoffMs();
    this.attempts += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }
}

/** ws:// or wss:// for the API's base URL. */
export function realtimeUrl(apiUrl: string, ticket: string): string {
  const base = apiUrl.replace(/\/$/, "").replace(/^http/, "ws");
  return `${base}/v1/realtime?ticket=${encodeURIComponent(ticket)}`;
}
