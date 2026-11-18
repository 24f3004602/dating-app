/**
 * Phones: WebRTC through react-native-webrtc (stage 23, D123, D126), a native module that
 * only the app's own build carries. Expo Go doesn't, so the module is looked up before the
 * package loads (the package's own check misses a module that is simply absent), and
 * without it Live says calls work in the web app. The web build uses rtc.web.ts.
 *
 * react-native-webrtc asks for the camera and microphone permissions itself; when only
 * one is granted it quietly leaves the other out. A call needs both, so that counts as
 * refused here.
 */
import { NativeModules } from "react-native";

import type { PeerConnectionCtor, StreamLike } from "@/calls/peer";

type WebRTC = typeof import("react-native-webrtc");
let loaded: WebRTC | null | undefined;

/** The library, or null where the native module isn't in the build (Expo Go, tests). */
export function webrtc(): WebRTC | null {
  if (loaded === undefined) {
    loaded = null;
    if (NativeModules.WebRTCModule) {
      try {
        loaded = require("react-native-webrtc") as WebRTC;
      } catch {
        loaded = null;
      }
    }
  }
  return loaded;
}

export function rtcSupported(): boolean {
  return webrtc() !== null;
}

/** The front camera and the microphone; both, or a refusal. */
export async function openCamera(): Promise<StreamLike> {
  const lib = webrtc();
  if (!lib) throw new Error("Live calls need the app's own build on phones");
  const stream = await lib.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 640, height: 480, frameRate: 24 },
    audio: true,
  });
  if (stream.getVideoTracks().length === 0 || stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw Object.assign(new Error("camera and microphone are both needed"), { name: "NotAllowedError" });
  }
  return stream as unknown as StreamLike;
}

export function peerConnection(): PeerConnectionCtor {
  const lib = webrtc();
  if (!lib) throw new Error("Live calls need the app's own build on phones");
  return lib.RTCPeerConnection as unknown as PeerConnectionCtor;
}
