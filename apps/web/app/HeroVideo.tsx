"use client";

import { useEffect, useRef, useState } from "react";

import {
  chooseHeroVideo,
  type HeroVideo as Config,
  type VideoSet,
} from "@/lib/heroVideo";

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * The candlelight loop over the story card's poster (stage 19, D099). Decorative:
 * muted, no sound track at all, hidden from screen readers; the hero's pause
 * control (MotionToggle) stops it.
 *
 * It never delays the page. Nothing is fetched until the browser is idle after
 * the first paint, and only if the visitor's settings allow it (reduced motion,
 * the data saver or a slow connection: no video). Small screens get the lighter
 * files. If it can't play (no supported source, autoplay refused), it's removed
 * and the poster underneath stays.
 */
export function HeroVideo({ video }: { video: Config }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [chosen, setChosen] = useState<VideoSet | null>(null);

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
    const start = () => setChosen(choice);
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
    if (!chosen || !element) return;
    // Rejected when no source can play or autoplay is refused: fall back to the poster.
    element.play().catch(() => setChosen(null));
  }, [chosen]);

  if (!chosen) return null;
  return (
    <video
      ref={ref}
      className="hero-story-media"
      poster={chosen.poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    >
      {chosen.sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </video>
  );
}
