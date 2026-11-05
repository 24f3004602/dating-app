import { connection } from "next/server";

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
        <span className="brand">Haanji</span>
        <span className="badge highlight">Not open yet</span>
      </header>
      <main id="main" className="page">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Fewer, better introductions</h1>
          <p>A short daily set of people who want what you want. No endless swiping.</p>
          <p className="muted">
            We&apos;re building and testing for Delhi NCR first. For adults aged 18 and over.
          </p>
        </section>
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
      </main>
      <footer>
        <p className="caption">
          Haanji is a working name. The terms and the privacy notice are drafts under legal review.
        </p>
      </footer>
    </>
  );
}
