/** A live video in the web build: a <video> showing a camera or a call (stage 23, D123). */
import { createElement, useEffect, useRef } from "react";

import type { StreamLike } from "@/calls/peer";
import { color } from "@/theme/tokens";

type Props = { stream: StreamLike | null; label: string; mirror?: boolean; muted?: boolean };

export function VideoView({ stream, label, mirror = false, muted = false }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const media = stream as unknown as MediaStream | null;
    if (video.srcObject !== media) video.srcObject = media;
    // Playing starts the sound too; the person pressed Start, which lets it play.
    if (media) void video.play().catch(() => undefined);
  }, [stream]);
  return createElement("video", {
    ref,
    autoPlay: true,
    playsInline: true,
    muted,
    "aria-label": label,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      backgroundColor: color.sign,
      transform: mirror ? "scaleX(-1)" : undefined,
    },
  });
}
