/**
 * Web: the candlelight loop behind the welcome screen, under the dark overlay
 * (stage 19, D099). React Native has no video element, so this file renders the
 * browser's own; phones use WelcomeBackdrop.tsx.
 *
 * - The still is drawn at once and stays whenever the video doesn't play.
 * - The video starts once the browser is idle after the first paint, and only if
 *   motion is welcome, the data saver is off and the connection isn't slow.
 *   Small screens get the lighter files.
 * - It loops for more than 5 seconds, so it has a pause button (WCAG 2.2.2).
 * - Decoration: muted, no sound track, hidden from screen readers.
 */
import { useEffect, useRef, useState } from "react";

import { MEDIA_URL, WELCOME_VIDEO } from "@/config";
import { t } from "@/i18n/en";
import { color, overlay, radius, space, touch, type } from "@/theme/tokens";
import { chooseLoop, loopVideo, type VideoSet } from "@/ui/loopVideo";
import { useMotionSetting } from "@/ui/motion";

const video = loopVideo(MEDIA_URL);
type Connection = { saveData?: boolean; effectiveType?: string };

export function WelcomeBackdrop() {
  const setting = useMotionSetting();
  const ref = useRef<HTMLVideoElement>(null);
  const [chosen, setChosen] = useState<VideoSet | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const choice = chooseLoop(
      video,
      {
        reducedMotion: setting !== false, // unknown counts as reduced
        saveData: connection?.saveData === true,
        effectiveType: connection?.effectiveType,
        narrow: window.matchMedia("(max-width: 40rem)").matches,
      },
      WELCOME_VIDEO,
    );
    if (!choice) {
      setChosen(null);
      return;
    }
    const start = () => setChosen(choice);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 500);
    return () => clearTimeout(id);
  }, [setting]);

  useEffect(() => {
    const element = ref.current;
    if (!chosen || !element) return;
    if (paused) element.pause();
    // Rejected when no source can play or autoplay is refused: fall back to the still.
    else element.play().catch(() => setChosen(null));
  }, [chosen, paused]);

  return (
    <>
      <div aria-hidden="true" style={styles.fill} data-welcome-video={chosen ? "playing" : "still"}>
        <img
          src={video.large.poster}
          srcSet={`${video.small.poster} 480w, ${video.large.poster} 720w`}
          sizes="100vw"
          alt=""
          decoding="async"
          style={styles.media}
        />
        {chosen ? (
          <video
            ref={ref}
            style={styles.media}
            poster={chosen.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          >
            {chosen.sources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </video>
        ) : null}
        <div style={styles.shade} />
      </div>
      {chosen ? (
        <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)} style={styles.pause}>
          {t.welcome.pauseVideo}
        </button>
      ) : null}
    </>
  );
}

const styles = {
  fill: { position: "absolute", inset: 0, overflow: "hidden", backgroundColor: color.overlay },
  media: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  shade: { position: "absolute", inset: 0, backgroundColor: color.overlay, opacity: overlay.opacity },
  // Above the screen's clear scroll area, so it can be pressed.
  pause: {
    position: "absolute",
    right: space.lg,
    bottom: space.lg,
    zIndex: 1,
    minHeight: touch.chip,
    padding: `0 ${space.md}px`,
    borderRadius: radius.pill,
    border: `1px solid ${color.borderInput}`,
    backgroundColor: color.bg,
    color: color.text,
    fontSize: type.caption.fontSize,
    cursor: "pointer",
  },
} as const;
