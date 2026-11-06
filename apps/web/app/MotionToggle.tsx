"use client";

import { useEffect, useState } from "react";

/**
 * Pauses the landing hero's moving background, and its video if there is one
 * (stage 19, D098). The shoreline keeps moving for more than 5 seconds, so it
 * needs a way to stop it (WCAG 2.2.2 Pause, Stop, Hide). Hidden when the
 * visitor asks for reduced motion: then nothing moves at all.
 */
export function MotionToggle({ target }: { target: string }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(target);
    if (!hero) return;
    hero.toggleAttribute("data-paused", paused);
    for (const video of hero.querySelectorAll("video")) {
      if (paused) video.pause();
      else void video.play().catch(() => undefined);
    }
  }, [paused, target]);

  return (
    <button
      type="button"
      className="motion-toggle"
      aria-pressed={paused}
      onClick={() => setPaused((p) => !p)}
    >
      Pause animation
    </button>
  );
}
