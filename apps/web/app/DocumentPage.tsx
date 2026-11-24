import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND } from "@/lib/config";
import { BETA_DATE, BETA_VERSION, CONTACT_EMAIL } from "@/lib/documents";

/** The contact address. A production website can't start without one (D150), so the
 * fallback only ever shows in development, where it says what's missing. */
export function Contact() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <>us (no contact address is set on this server)</>
  );
}

/** The shared frame for the tester notice pages, and the deletion page (not versioned). */
export function DocumentPage({
  title,
  children,
  versioned = true,
}: {
  title: string;
  children: ReactNode;
  versioned?: boolean;
}) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" href="/">
          {BRAND}
        </Link>
        <span className="badge highlight">Test version</span>
      </header>
      <main id="main" className="page document">
        <h1>{title}</h1>
        {versioned ? (
          <p className="muted">
            Version {BETA_VERSION}, {BETA_DATE}. For the test, which anyone 18 or over can join.
            Full documents will follow.
          </p>
        ) : null}
        {children}
      </main>
      <footer>
        <p className="caption">
          <Link href="/terms">Terms for testers</Link> ·{" "}
          <Link href="/privacy">Privacy notice</Link> ·{" "}
          <Link href="/android">Android app</Link> ·{" "}
          <Link href="/delete-account">Delete your account</Link>
        </p>
      </footer>
    </>
  );
}
