import { HeroVideo } from "@/app/HeroVideo";
import type { HeroVideo as Config } from "@/lib/heroVideo";

/**
 * The landing hero's story card (stage 19, D099): candlelight in a portrait
 * frame beside the words, and below them on phones. The still poster is part of
 * the page from the first paint (its box is reserved, so nothing shifts), and it
 * stays whenever the video doesn't play. People-free footage, so there's no one
 * to mistake for a member. Decorative: hidden from screen readers.
 */
export function HeroStory({ video }: { video: Config }) {
  return (
    <figure className="hero-story" aria-hidden="true">
      <img
        className="hero-story-media"
        src={video.large.poster}
        srcSet={`${video.small.poster} 480w, ${video.large.poster} 720w`}
        sizes="(min-width: 48rem) 18rem, 60vw"
        width={720}
        height={1280}
        alt=""
        decoding="async"
      />
      <HeroVideo video={video} />
    </figure>
  );
}
