import { HeroVideo } from "@/app/HeroVideo";
import type { HeroVideo as Config } from "@/lib/heroVideo";

/**
 * The landing hero's backdrop (stage 19, D098): a shoreline at dusk, because
 * "Kinaara" means shore. Drawn in code (about 1 KB), so there's nothing to
 * download; three waves sway slowly and a marigold glow warms and cools. No
 * people and no pretend app activity.
 *
 * It sits below the words, which never overlap the waves (the hero keeps room
 * for them), so the text keeps its normal contrast. With a video configured,
 * the video plays over the drawing and a scrim keeps the text side readable.
 * Everything here is decoration, hidden from screen readers. The motion lives
 * in globals.css, only for visitors who haven't asked for reduced motion.
 */
export function HeroBackdrop({ video }: { video: Config | null }) {
  return (
    <div
      className="hero-backdrop"
      aria-hidden="true"
      data-video={video ? "on" : undefined}
    >
      <div className="dusk" />
      <svg
        className="shore"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        focusable="false"
      >
        {/* Each wave runs 120 units past both edges, so the sway never shows an end. */}
        <path
          className="wave wave-back"
          d="M-120 112 C120 52 360 172 600 112 C840 52 1080 172 1320 112 C1440 82 1500 98 1560 112 L1560 240 L-120 240 Z"
        />
        <path
          className="wave wave-mid"
          d="M-120 150 C160 102 400 198 680 150 C960 102 1200 198 1560 150 L1560 240 L-120 240 Z"
        />
        <path
          className="wave wave-front"
          d="M-120 186 C200 150 440 222 720 186 C1000 150 1240 222 1560 186 L1560 240 L-120 240 Z"
        />
      </svg>
      {video ? <HeroVideo video={video} /> : null}
    </div>
  );
}
