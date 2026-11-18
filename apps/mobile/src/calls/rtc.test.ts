/**
 * LIVE-APP-16 (stage 23, D126): the phone adapter. Without react-native-webrtc's native
 * module (Expo Go, tests) Live isn't offered and the package is never loaded; with it, the
 * camera needs both the picture and the sound, and calls use the library's connection.
 */
import { NativeModules } from "react-native";

type Track = { kind: string; enabled: boolean; stop: jest.Mock };
const stream = (kinds: string[]) => {
  const tracks: Track[] = kinds.map((kind) => ({ kind, enabled: true, stop: jest.fn() }));
  return {
    tracks,
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    toURL: () => "stream-1",
  };
};

const mockGetUserMedia = jest.fn();
class MockPeerConnection {}
jest.mock("react-native-webrtc", () => ({
  mediaDevices: { getUserMedia: (...args: unknown[]) => mockGetUserMedia(...args) },
  RTCPeerConnection: MockPeerConnection,
  RTCView: () => null,
}));

const modules = NativeModules as Record<string, unknown>;

function load(): typeof import("@/calls/rtc") {
  let rtc: typeof import("@/calls/rtc") | undefined;
  jest.isolateModules(() => {
    rtc = require("@/calls/rtc") as typeof import("@/calls/rtc");
  });
  return rtc as typeof import("@/calls/rtc");
}

afterEach(() => {
  delete modules.WebRTCModule;
  mockGetUserMedia.mockReset();
});

test("without the native module, Live isn't offered on the phone", async () => {
  const rtc = load();
  expect(rtc.rtcSupported()).toBe(false);
  await expect(rtc.openCamera()).rejects.toThrow("app's own build");
  expect(mockGetUserMedia).not.toHaveBeenCalled();
});

test("with it: the front camera and microphone, both or a refusal; the library's connection", async () => {
  modules.WebRTCModule = {};
  const rtc = load();
  expect(rtc.rtcSupported()).toBe(true);

  const both = stream(["video", "audio"]);
  mockGetUserMedia.mockResolvedValueOnce(both);
  expect(await rtc.openCamera()).toBe(both);
  expect(mockGetUserMedia).toHaveBeenCalledWith({
    video: { facingMode: "user", width: 640, height: 480, frameRate: 24 },
    audio: true,
  });

  const pictureOnly = stream(["video"]); // the microphone refused: the library leaves it out
  mockGetUserMedia.mockResolvedValueOnce(pictureOnly);
  await expect(rtc.openCamera()).rejects.toMatchObject({ name: "NotAllowedError" });
  expect(pictureOnly.tracks[0]?.stop).toHaveBeenCalled();

  expect(rtc.peerConnection()).toBe(MockPeerConnection);
});
