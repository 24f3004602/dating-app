/** The browser's WebRTC: the app's web build (stage 23, D123). */
import type { PeerConnectionCtor, StreamLike } from "@/calls/peer";

export function rtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** The front camera and the microphone, at a size a one-to-one call needs. */
export async function openCamera(): Promise<StreamLike> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export function peerConnection(): PeerConnectionCtor {
  return window.RTCPeerConnection as unknown as PeerConnectionCtor;
}

/** Browsers route a call's sound themselves. */
export const callAudio = undefined;
