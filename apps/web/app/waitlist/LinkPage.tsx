import Link from "next/link";

import { LinkAction } from "@/app/waitlist/LinkAction";
import { BRAND } from "@/lib/config";
import { linkToken } from "@/lib/waitlist";

import styles from "../landing.module.css";

/** The shared frame of the confirm and leave pages: the station sign, one panel, one button. */
export function LinkPage({
  kind,
  raw,
  title,
  intro,
}: {
  kind: "confirm" | "leave";
  raw: string | string[] | undefined;
  title: string;
  intro: string;
}) {
  const token = linkToken(raw);
  return (
    <div className={styles.landing}>
      <header className={styles.sign}>
        <p className={styles.name}>
          <svg className={styles.mark} viewBox="0 0 48 32" aria-hidden="true">
            <circle cx="17" cy="16" r="12" fill="none" stroke="#ffffff" strokeWidth="4.5" />
            <circle cx="31" cy="16" r="12" fill="none" stroke="var(--color-highlight)" strokeWidth="4.5" />
          </svg>
          <Link href="/" className={[styles.latin, styles.home].join(" ")}>
            {BRAND}
          </Link>
        </p>
      </header>
      <div className={styles.lines} aria-hidden="true">
        <span />
        <span />
      </div>
      <main className={styles.linkMain}>
        <section className={styles.panel} aria-labelledby="link-title">
          <h1 id="link-title" className={styles.linkTitle}>
            {title}
          </h1>
          {token ? (
            <>
              <p className={styles.consent}>{intro}</p>
              <LinkAction kind={kind} token={token} />
            </>
          ) : (
            <p className={styles.fieldError}>This link is incomplete. Open the link from the email again.</p>
          )}
        </section>
      </main>
    </div>
  );
}
