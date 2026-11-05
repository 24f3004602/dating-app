import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND } from "@/lib/config";
import { BETA_DATE, BETA_VERSION, CONTACT_EMAIL } from "@/lib/documents";

export function Contact() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <>the email address your invite came from</>
  );
}

/** The shared frame for the tester notice pages. */
export function DocumentPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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
        <span className="badge highlight">Invite-only test</span>
      </header>
      <main id="main" className="page document">
        <h1>{title}</h1>
        <p className="muted">
          Version {BETA_VERSION}, {BETA_DATE}. For a small, invite-only test.
          Full documents will follow before any public launch.
        </p>
        {children}
      </main>
      <footer>
        <p className="caption">
          <Link href="/terms">Terms for testers</Link> ·{" "}
          <Link href="/privacy">Privacy notice for testers</Link>
        </p>
      </footer>
    </>
  );
}
