/**
 * Phones: video needs react-native-webrtc's view, which arrives with the app's own build
 * (stage 23, D123). Until then this is never shown with a stream: Live on a phone says
 * calls work in the web app (calls/rtc.ts).
 */
import { View } from "react-native";

import type { StreamLike } from "@/calls/peer";
import { color } from "@/theme/tokens";

type Props = { stream: StreamLike | null; label: string; mirror?: boolean; muted?: boolean };

export function VideoView({ label }: Props) {
  return <View accessible aria-label={label} style={{ flex: 1, backgroundColor: color.sign }} />;
}
