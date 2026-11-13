import Link from "next/link";
import { connection } from "next/server";

import { HeroStory } from "@/app/HeroStory";
import { MotionToggle } from "@/app/MotionToggle";
import { RouteDiagram } from "@/app/RouteDiagram";
import { WaitlistForm } from "@/app/WaitlistForm";
import { BRAND, BRAND_DEVANAGARI } from "@/lib/config";
import { heroSceneEnabled } from "@/lib/heroScene";
import { heroVideoConfig } from "@/lib/heroVideo";
import { HOME, type Lang, messages } from "@/lib/i18n";

import styles from "./landing.module.css";

/**
 * The landing page (stage 20d, D101-D104), in one language at a time (stage 22a, D120;
 * the owner's request): English at /, Hindi at /hi, never one written beside the other.
 * The sign band links each to the other, named in its own language. The words are in
 * lib/i18n; the documents and the emails exist only in English, and the Hindi page
 * says so where it links to them.
 */
export async function Landing({ lang }: { lang: Lang }) {
  await connection(); // rendered per request, so the CSP nonce applies
  return <LandingView lang={lang} />;
}

/** The page itself, without the per-request wait (the preview renders this directly). */
export function LandingView({ lang }: { lang: Lang }) {
  const t = messages(lang);
  // The name in Devanagari, where it's set, belongs on the Hindi page only.
  const name = lang === "hi" && BRAND_DEVANAGARI ? BRAND_DEVANAGARI : BRAND;
  const form = {
    email: t.form.email,
    adult: t.form.adult,
    consent: t.form.consent(name),
    privacy: t.form.privacy,
    submit: t.form.submit,
    pending: t.form.pending,
  };
  // The legal documents are in English: a Hindi page marks its links to them as such.
  const docLang = lang === "en" ? undefined : "en";
  return (
    <div className={styles.landing}>
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <header className={styles.sign}>
        <p className={styles.name}>
          <svg className={styles.mark} viewBox="0 0 48 32" aria-hidden="true">
            <circle cx="17" cy="16" r="12" fill="none" stroke="#ffffff" strokeWidth="4.5" />
            <circle cx="31" cy="16" r="12" fill="none" stroke="var(--color-highlight)" strokeWidth="4.5" />
          </svg>
          <span className={name === BRAND ? styles.latin : styles.devanagari}>{name}</span>
        </p>
        <div className={styles.signEnd}>
          <p className={styles.status}>{t.status}</p>
          <a className={styles.language} href={HOME[t.other.lang]} lang={t.other.lang} hrefLang={t.other.lang}>
            {t.other.name}
          </a>
        </div>
      </header>
      <div className={styles.lines} aria-hidden="true">
        <span />
        <span />
      </div>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.headline}>
            {t.headline}
          </h1>
          <p className={styles.lede}>{t.lede}</p>
          <RouteDiagram words={t.map} scene={heroSceneEnabled(process.env)} />
          <section className={styles.panel} aria-labelledby="join-title">
            <h2 id="join-title">{t.join.heading}</h2>
            <WaitlistForm lang={lang} words={form} privacyLang={docLang} />
          </section>
        </section>

        <section className={styles.route} aria-labelledby="route-title">
          <div className={styles.routeSide}>
            <h2 id="route-title">{t.route.title}</h2>
            <ul className={styles.legend} aria-label={t.route.legendLabel}>
              <li>
                <span className={styles.keyYou} aria-hidden="true" />
                {t.route.legend.you}
              </li>
              <li>
                <span className={styles.keyThem} aria-hidden="true" />
                {t.route.legend.them}
              </li>
              <li>
                <span className={styles.keyRings} aria-hidden="true" />
                {t.route.legend.rings}
              </li>
              <li>
                <span className={styles.keyEnd} aria-hidden="true" />
                {t.route.legend.end}
              </li>
            </ul>
            <a className={styles.towards} href="#join-end-title">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
              <span>{t.route.towards}</span>
            </a>
          </div>
          <ol className={styles.stations}>
            {t.stations.map((s) => (
              <li key={s.title} className={[styles.station, s.interchange && styles.interchange].filter(Boolean).join(" ")}>
                <span className={styles.stop} aria-hidden="true" />
                <h3 className={styles.plate3}>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
            <li className={[styles.station, styles.terminus].join(" ")} id="destination">
              <span className={styles.stop} aria-hidden="true" />
              <h3 className={styles.plate3}>{t.terminus.title}</h3>
              <p>{t.terminus.body}</p>
              <div className={styles.terminusImage}>
                <HeroStory video={heroVideoConfig(process.env)} sizes="(min-width: 64rem) 34rem, 90vw" />
                <MotionToggle target="destination" label={t.terminus.pause} />
              </div>
            </li>
          </ol>
        </section>
      </main>

      {/* The close: a graphite band, like the sign at the top. */}
      <div className={styles.closing}>
        <section className={[styles.panel, styles.last].join(" ")} aria-labelledby="join-end-title">
          <h2 id="join-end-title">{t.join.endHeading}</h2>
          <WaitlistForm lang={lang} words={form} privacyLang={docLang} />
        </section>
        <footer className={styles.footer}>
          <p>
            {t.footer.lead(name)}{" "}
            <Link href="/terms" hrefLang={docLang}>
              {t.footer.terms}
            </Link>{" "}
            {t.footer.joiner}{" "}
            <Link href="/privacy" hrefLang={docLang}>
              {t.footer.privacy}
            </Link>
            {t.footer.close}
          </p>
        </footer>
      </div>
    </div>
  );
}
