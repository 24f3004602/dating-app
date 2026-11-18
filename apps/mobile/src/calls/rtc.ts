/**
 * Phones: WebRTC needs react-native-webrtc, a native module that Expo Go doesn't carry.
 * Until the app's own build has it (stage 23, D123), Live on a phone says calls work in
 * the web app for now, and nothing here is called. The web build uses rtc.web.ts.
 */
import type { PeerConnectionCtor, StreamLike } from "@/calls/peer";

export function rtcSupported(): boolean {
  return false;
}

export async function openCamera(): Promise<StreamLike> {
  throw new Error("Live calls need the app's own build on phones");
}

export function peerConnection(): PeerConnectionCtor {
  throw new Error("Live calls need the app's own build on phones");
}
