import Link from "next/link";
import { connection } from "next/server";

import { HeroStory } from "@/app/HeroStory";
import { MotionToggle } from "@/app/MotionToggle";
import { RouteDiagram } from "@/app/RouteDiagram";
import { WaitlistForm } from "@/app/WaitlistForm";
import { BRAND, BRAND_DEVANAGARI } from "@/lib/config";
import { heroVideoConfig } from "@/lib/heroVideo";

import styles from "./landing.module.css";

// "Fit both ways" in Hindi; its letters are in scripts/devanagari-text.txt.
const BOTH_WAYS_HI = "दोनों तरफ़ से";

type Station = { title: string; body: string; kind?: "joined" | "interchange" };

// Every station is something the app already does and tests check (features.csv);
// nothing about members, numbers or reviews, because there are none yet.
const STATIONS: Station[] = [
  {
    title: "Say what you're looking for",
    body: "Your intentions are part of your profile, and they're required. You also say who you'd like to meet and the ages that suit you.",
  },
  {
    kind: "interchange",
    title: "Fit both ways",
    body: "Someone joins your line only if they fit what you want and you fit what they want: intentions, preferences and age, checked both ways.",
  },
  {
    kind: "joined",
    title: "Up to 15 introductions a day",
    body: "The same set all day, a new one each day. No deck to swipe through.",
  },
  {
    kind: "joined",
    title: "Ten likes a day, for everyone",
    body: "Every member gets the same ten. More likes are never for sale.",
  },
  {
    kind: "joined",
    title: "Answer before you collect more",
    body: "When five people are waiting for your reply, new likes pause until you answer someone.",
  },
  {
    kind: "joined",
    title: "Safety tools are free",
    body: "Block, report and unmatch from any profile or chat. People review reports, and every photo is checked before anyone sees it.",
  },
  {
    kind: "joined",
    title: "Labels say only what we checked",
    body: "“Age declared” and “email verified”: exactly what was checked, never more.",
  },
  {
    kind: "joined",
    title: "Your location stays vague",
    body: "Others see your area and a distance range, never where you are.",
  },
  {
    kind: "joined",
    title: "Leave whenever you like",
    body: "Delete your account in the app. You're hidden at once, and everything is deleted after 7 days, apart from the safety records the privacy notice lists.",
  },
];

export default async function Landing() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <div className={styles.landing}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className={styles.sign}>
        <p className={styles.name}>
          <svg className={styles.mark} viewBox="0 0 48 32" aria-hidden="true">
            <circle cx="17" cy="16" r="12" fill="none" stroke="#ffffff" strokeWidth="4.5" />
            <circle cx="31" cy="16" r="12" fill="none" stroke="var(--color-highlight)" strokeWidth="4.5" />
          </svg>
          <span>
            <span className={styles.latin}>{BRAND}</span>
            {BRAND_DEVANAGARI && (
              <span className={styles.devanagari} lang="hi">
                {BRAND_DEVANAGARI}
              </span>
            )}
          </span>
        </p>
        <p className={styles.status}>Not open yet</p>
      </header>
      <div className={styles.lines} aria-hidden="true">
        <span />
        <span />
      </div>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.headline}>
            Fewer, better introductions.
          </h1>
          <p className={styles.lede}>
            Up to 15 people a day, and only where what you want fits what they want, both ways.
          </p>
          <RouteDiagram hindi={BOTH_WAYS_HI} />
          <section className={styles.panel} aria-labelledby="join-title">
            <h2 id="join-title">Next stop: Delhi NCR</h2>
            <WaitlistForm brand={BRAND} />
          </section>
        </section>

        <section className={styles.route} aria-labelledby="route-title">
          <h2 id="route-title">How it works, stop by stop</h2>
          <ol className={styles.stations}>
            {STATIONS.map((s) => (
              <li
                key={s.title}
                className={[styles.station, s.kind && styles[s.kind], s.kind === "interchange" && styles.joined]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.stop} aria-hidden="true" />
                <h3>
                  {s.title}
                  {s.kind === "interchange" && (
                    <span className={styles.hindi} lang="hi">
                      {BOTH_WAYS_HI}
                    </span>
                  )}
                </h3>
                <p>{s.body}</p>
              </li>
            ))}
            <li className={[styles.station, styles.joined, styles.terminus].join(" ")} id="destination">
              <span className={styles.stop} aria-hidden="true" />
              <h3>Then, a conversation</h3>
              <div className={styles.destination}>
                <p>Chat opens only when you both like each other. That&apos;s where the line leads.</p>
                <div className={styles.story}>
                  <HeroStory video={heroVideoConfig(process.env)} />
                  <MotionToggle target="destination" label="Pause video" />
                </div>
              </div>
            </li>
          </ol>
        </section>

      </main>

      {/* The close: a graphite band, like the sign at the top. */}
      <div className={styles.closing}>
        <section className={[styles.panel, styles.last].join(" ")} aria-labelledby="join-end-title">
          <h2 id="join-end-title">Join the waitlist</h2>
          <WaitlistForm brand={BRAND} />
        </section>
        <footer className={styles.footer}>
          <p>
            {BRAND} is a working name. For the invite-only test: <Link href="/terms">terms for testers</Link> and the{" "}
            <Link href="/privacy">privacy notice</Link>. Full documents will follow before any public launch.
          </p>
        </footer>
      </div>
    </div>
  );
}
