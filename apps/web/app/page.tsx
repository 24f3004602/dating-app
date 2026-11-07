import Link from "next/link";
import { connection } from "next/server";

import { HeroBackdrop } from "@/app/HeroBackdrop";
import { HeroStory } from "@/app/HeroStory";
import { MotionToggle } from "@/app/MotionToggle";
import { BRAND } from "@/lib/config";
import { heroVideoConfig } from "@/lib/heroVideo";

// Every claim here is something the app already does and tests check (features.csv);
// nothing about members, numbers or reviews, because there are none yet.
const FEATURES = [
  {
    title: "Intentions first",
    body: "You say what you're looking for. Introductions only include people whose intentions and preferences fit yours, both ways.",
  },
  {
    title: "A short daily set",
    body: "Up to 15 introductions a day, the same set all day. No endless deck to swipe through.",
  },
  {
    title: "The same likes for everyone",
    body: "Ten likes a day for every member. More likes are never for sale.",
  },
  {
    title: "Conversations that move",
    body: "When five people are waiting for your reply, new likes pause until you answer someone.",
  },
  {
    title: "Safety tools, free",
    body: "Block, report and unmatch from any profile or chat. Reports are reviewed by people, and photos are checked before anyone sees them.",
  },
  {
    title: "Honest labels",
    body: "We show “age declared” and “email verified”: only what we actually checked, never more.",
  },
  {
    title: "Your location stays vague",
    body: "Others see your area and a distance range, never your exact location.",
  },
  {
    title: "Leave whenever you like",
    body: "Delete your account in the app. You're hidden at once, and everything is deleted after 7 days, apart from the safety records our privacy notice lists.",
  },
];

export default async function Landing() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <span className="brand">{BRAND}</span>
        <span className="badge highlight">Not open yet</span>
      </header>
      <main id="main">
        {/* The first impression (stage 19, D098-D099): a shoreline at dusk behind the
            words, and a candlelight story card beside them (below them on phones). */}
        <section className="hero" id="hero" aria-labelledby="hero-title">
          <HeroBackdrop />
          <div className="page hero-inner">
            <div className="hero-text">
              <h1 id="hero-title">Fewer, better introductions</h1>
              <p>
                A short daily set of people who want what you want. No endless
                swiping.
              </p>
              <p className="muted">
                We&apos;re building and testing for Delhi NCR first. For adults
                aged 18 and over.
              </p>
            </div>
            <HeroStory video={heroVideoConfig(process.env)} />
          </div>
          <MotionToggle target="hero" />
        </section>
        <div className="page">
          <section aria-labelledby="how-title">
            <h2 id="how-title">How it works</h2>
            <ul className="features">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <footer>
        <p className="caption">
          {BRAND} is a working name. For the invite-only test:{" "}
          <Link href="/terms">terms for testers</Link> and{" "}
          <Link href="/privacy">privacy notice for testers</Link>. Full
          documents will follow before any public launch.
        </p>
      </footer>
    </>
  );
}
