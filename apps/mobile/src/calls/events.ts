/** Realtime hints about calls (`call.updated`), from the realtime provider to a Live session. */
type Listener = (callId: string) => void;

const listeners = new Set<Listener>();

export function onCallUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitCallUpdated(callId: string): void {
  listeners.forEach((listener) => listener(callId));
}
