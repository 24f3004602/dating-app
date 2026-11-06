"use client";

import { useEffect, useRef, useState } from "react";

import { chooseHeroVideo, type HeroVideo as Config } from "@/lib/heroVideo";

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * The landing hero's background video (stage 19, D098), only when configured
 * (lib/heroVideo.ts). Decorative: muted, looping, no sound, hidden from screen
 * readers; the pause control (MotionToggle) stops it too.
 *
 * It never delays the page: nothing is fetched until the browser is idle after
 * the first paint, and only if the visitor's settings allow it (reduced motion,
 * data saver, a slow connection or a small screen without a light file: no
 * video). If it can't load or autoplay is blocked, it's removed again and the
 * drawn shoreline behind it stays.
 */
export function HeroVideo({ video }: { video: Config }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: Connection })
      .connection;
    const choice = chooseHeroVideo(video, {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      saveData: connection?.saveData === true,
      effectiveType: connection?.effectiveType,
      narrow: window.matchMedia("(max-width: 40rem)").matches,
    });
    if (!choice) return;
    const start = () => setSrc(choice);
    // After the first paint, when the browser is idle (or after a short wait where there's no idle callback).
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 500);
    return () => clearTimeout(id);
  }, [video]);

  useEffect(() => {
    const element = ref.current;
    if (!src || !element) return;
    // Autoplay can be refused (power saving, browser policy): fall back to the drawing.
    element.play().catch(() => setSrc(null));
  }, [src]);

  if (!src) return null;
  return (
    <>
      <video
        ref={ref}
        className="hero-video"
        src={src}
        poster={video.poster ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        onError={() => setSrc(null)}
      />
      {/* Only while a video plays: it keeps the words' side of the hero at full contrast. */}
      <div className="scrim" />
    </>
  );
}
