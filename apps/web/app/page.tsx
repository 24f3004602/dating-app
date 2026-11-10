import Link from "next/link";
import { connection } from "next/server";

import { HeroStory } from "@/app/HeroStory";
import { MotionToggle } from "@/app/MotionToggle";
import { RouteDiagram } from "@/app/RouteDiagram";
import { WaitlistForm } from "@/app/WaitlistForm";
import { BRAND, BRAND_DEVANAGARI } from "@/lib/config";
import { heroVideoConfig } from "@/lib/heroVideo";

import styles from "./landing.module.css";

// Hindi on every sign that names a place or a rule (the direction contract, D103).
// Every letter is in scripts/devanagari-text.txt. A native speaker reviews these
// before the page goes live.
const BOTH_WAYS_HI = "दोनों तरफ़ से";
const NEXT_STOP_HI = "अगला स्टेशन: दिल्ली एनसीआर";

type Station = { title: string; hindi: string; body: string; interchange?: boolean };

// Every station is something the app already does and tests check (features.csv);
// nothing about members, numbers or reviews, because there are none yet. The line
// starts at the interchange the first screen shows; "what you're looking for" is on
// the map's two lines.
const STATIONS: Station[] = [
  {
    interchange: true,
    title: "Fit both ways",
    hindi: BOTH_WAYS_HI,
    body: "Your intentions are part of your profile, and they're required. Someone joins your line only if they fit what you want and you fit what they want: intentions, preferences and age, checked both ways.",
  },
  {
    title: "Up to 15 introductions a day",
    hindi: "रोज़ 15 तक परिचय",
    body: "The same set all day, a new one each day. No deck to swipe through.",
  },
  {
    title: "Ten likes a day, for everyone",
    hindi: "रोज़ दस लाइक, सबके लिए",
    body: "Every member gets the same ten. More likes are never for sale.",
  },
  {
    title: "Answer before you collect more",
    hindi: "पहले जवाब, फिर और",
    body: "When five people are waiting for your reply, new likes pause until you answer someone.",
  },
  {
    title: "Safety tools are free",
    hindi: "सुरक्षा के टूल मुफ़्त",
    body: "Block, report and unmatch from any profile or chat. People review reports, and every photo is checked before anyone sees it.",
  },
  {
    title: "Labels say only what we checked",
    hindi: "लेबल पर सिर्फ़ वही, जो हमने जाँचा",
    body: "“Age declared” and “email verified”: exactly what was checked, never more.",
  },
  {
    title: "Your location stays vague",
    hindi: "आपकी जगह मोटे तौर पर ही दिखती है",
    body: "Others see your area and a distance range, never where you are.",
  },
  {
    title: "Leave whenever you like",
    hindi: "जब चाहें, छोड़ दें",
    body: "Delete your account in the app. You're hidden at once, and everything is deleted after 7 days, apart from the safety records the privacy notice lists.",
  },
];

function Plate({ title, hindi }: { title: string; hindi: string }) {
  return (
    <h3 className={styles.plate3}>
      {title}
      <span className={styles.plateHindi} lang="hi">
        {hindi}
      </span>
    </h3>
  );
}

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
            <h2 id="join-title">
              Next stop: Delhi NCR
              <span className={styles.plateHindi} lang="hi">
                {NEXT_STOP_HI}
              </span>
            </h2>
            <WaitlistForm brand={BRAND} />
          </section>
        </section>

        <section className={styles.route} aria-labelledby="route-title">
          <div className={styles.routeSide}>
            <h2 id="route-title">How it works, stop by stop</h2>
            <ul className={styles.legend} aria-label="How to read the line">
              <li>
                <span className={styles.keyYou} aria-hidden="true" />
                Your line
              </li>
              <li>
                <span className={styles.keyThem} aria-hidden="true" />
                Theirs
              </li>
              <li>
                <span className={styles.keyRings} aria-hidden="true" />
                Interchange: you fit each other
              </li>
              <li>
                <span className={styles.keyEnd} aria-hidden="true" />
                End of the line
              </li>
            </ul>
            <a className={styles.towards} href="#join-end-title">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
              <span>
                Towards the waitlist
                <span className={styles.plateHindi} lang="hi">
                  वेटलिस्ट की ओर
                </span>
              </span>
            </a>
          </div>
          <ol className={styles.stations}>
            {STATIONS.map((s) => (
              <li key={s.title} className={[styles.station, s.interchange && styles.interchange].filter(Boolean).join(" ")}>
                <span className={styles.stop} aria-hidden="true" />
                <Plate title={s.title} hindi={s.hindi} />
                <p>{s.body}</p>
              </li>
            ))}
            <li className={[styles.station, styles.terminus].join(" ")} id="destination">
              <span className={styles.stop} aria-hidden="true" />
              <Plate title="Then, a conversation" hindi="फिर, बातचीत" />
              <p>Chat opens only when you both like each other. That&apos;s where the line leads.</p>
              <div className={styles.terminusImage}>
                <HeroStory video={heroVideoConfig(process.env)} sizes="(min-width: 64rem) 34rem, 90vw" />
                <MotionToggle target="destination" label="Pause video" />
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
