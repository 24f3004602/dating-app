/**
 * Phones: a camera or a call through react-native-webrtc's RTCView (stage 23, D126). Your
 * own picture is drawn above theirs (zOrder 1), as it sits in the corner of the call.
 * Without the native module (Expo Go) this is an empty graphite panel, never shown with a
 * stream: Live there says calls work in the web app (calls/rtc.ts).
 */
import { View } from "react-native";

import type { StreamLike } from "@/calls/peer";
import { webrtc } from "@/calls/rtc";
import { color } from "@/theme/tokens";

type Props = { stream: StreamLike | null; label: string; mirror?: boolean; muted?: boolean };

export function VideoView({ stream, label, mirror = false }: Props) {
  const lib = webrtc();
  const url = stream?.toURL?.();
  return (
    <View accessible aria-label={label} style={{ flex: 1, backgroundColor: color.sign }}>
      {lib && url ? (
        <lib.RTCView streamURL={url} mirror={mirror} objectFit="cover" zOrder={mirror ? 1 : 0} style={{ flex: 1 }} />
      ) : null}
    </View>
  );
}
