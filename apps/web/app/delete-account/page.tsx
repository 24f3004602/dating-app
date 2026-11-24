import type { Metadata } from "next";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { APP_URL, BRAND } from "@/lib/config";
import { DELETION as D, storeTitle, years } from "@/lib/deletion";
import { BETA_HOSTING, OPERATOR } from "@/lib/documents";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your account, with or without the app, and what happens to your data.",
};

/**
 * The account-deletion page Google Play asks for (stage 27c, D150): the way to delete
 * comes first and works without the app; then what happens, what is deleted, and what is
 * kept and for how long. Every statement matches what the app does today
 * (privacy-data-inventory.md); the numbers come from lib/deletion.ts, which a test holds
 * to the code's own. Written in English, like the privacy notice and the terms.
 */
export default async function DeleteAccount() {
  await connection(); // rendered per request, so the CSP nonce applies
  const appHost = new URL(APP_URL).host;
  return (
    <DocumentPage title="Delete your account" versioned={false}>
      <p>
        For {storeTitle(BRAND)}, the Android app, and the web app at {appHost}, run by{" "}
        {OPERATOR}. You can delete your account yourself at any time, in the app or in any web
        browser.
      </p>

      <h2>Delete it yourself</h2>
      <ol>
        <li>
          <strong>In the app</strong>: go to <strong>You</strong>, then{" "}
          <strong>Delete account</strong>, and confirm with your password. If you sign in with
          Google, you choose your Google account again instead.
        </li>
        <li>
          <strong>Without the app</strong>: sign in at {appHost} in any browser, on a phone or a
          computer, with nothing to install. Then do the same: <strong>You</strong>, then{" "}
          <strong>Delete account</strong>.
        </li>
      </ol>
      <p>
        <a className="button" href={`${APP_URL}/sign-in`}>
          Sign in to delete your account
        </a>
      </p>

      <h2>If you can&apos;t sign in</h2>
      <ul>
        <li>
          <strong>Forgot your password?</strong> Choose it on the sign-in screen: we email a code
          to your account&apos;s address, and you choose a new password.
        </li>
        <li>
          <strong>Joined with Google?</strong> Choose <strong>Sign in with Google</strong>.
        </li>
        <li>
          <strong>Suspended or banned, or still stuck?</strong> Write to <Contact /> from your
          account&apos;s email address and ask us to delete it. We reply to that address to check
          the request is yours, then start the deletion just as the app would, and tell you the
          date. We answer within 7 days.
        </li>
      </ul>

      <h2>What happens</h2>
      <ul>
        <li>
          <strong>At once</strong>: your profile is hidden from everyone, you&apos;re signed out
          on every device, your matches end and their chats with you close, and a Live call
          you&apos;re on ends. {BRAND} Plus ends with your account; a pass that has started
          isn&apos;t refunded (see the terms).
        </li>
        <li>
          <strong>For {D.graceDays} days</strong> you can change your mind: sign in and choose{" "}
          <strong>Keep my account</strong>. Matches that ended stay ended.
        </li>
        <li>
          <strong>After {D.graceDays} days</strong>, your data is deleted, except what&apos;s
          listed below. If a report about your account is still open, the deletion waits until
          it&apos;s handled, at most {D.reportHoldDays} more days, so that deleting can&apos;t
          erase what our review team needs to see.
        </li>
      </ul>

      <h2>What we delete</h2>
      <p>
        Your email address and password; your date of birth; your profile (name, gender, who
        you&apos;d like to meet, what you&apos;re looking for, your area, bio and prompt
        answers); your photos and their files; your preferences and settings; likes and passes,
        yours and those sent to you; your matches and conversations, including both
        people&apos;s messages; blocks; your Live record (the rules you accepted, your free
        calls and your calls); notices from our team; your sign-ins and devices; and the link to
        your Google account.
      </p>

      <h2>What we keep, and for how long</h2>
      <ul>
        <li>
          <strong>A record of what you agreed to</strong>: which versions of the terms and
          privacy notice you accepted and when, and when you asked for the deletion. Kept{" "}
          {years(D.recordYears)}, as proof of consent.
        </li>
        <li>
          <strong>Reports</strong> you made or that were made about you, with a copy of any
          reported message: kept for safety, no longer showing who you are, and deleted{" "}
          {years(D.reportYears)} after they&apos;re resolved.
        </li>
        <li>
          <strong>Our review team&apos;s decisions and our audit records</strong>: what was done
          and when, with your account&apos;s ID number but not your name or email. Kept{" "}
          {years(D.auditYears)}.
        </li>
        <li>
          <strong>{BRAND} Plus payments</strong>: the payment&apos;s code and amount, your UPI
          reference and the dates. Accounting records the law requires us to keep, for{" "}
          {years(D.paymentYears)}, no longer linked to your account.
        </li>
        <li>
          <strong>If your account was banned</strong>: a scrambled form (a keyed hash) of its email
          address, for {years(D.recordYears)}, so the same address can&apos;t sign up again
          straight away.
        </li>
        <li>
          <strong>Security logs</strong>: shortened IP addresses, which pages were used and when,
          with your account&apos;s ID number. Up to {years(D.securityLogYears)}, to stop abuse and
          investigate problems.
        </li>
        <li>
          <strong>Backups</strong>: we back up every day and keep each backup {D.backupDays}{" "}
          days, so your data leaves them about a week after it&apos;s deleted.
          {BETA_HOSTING === "home" ? (
            <>
              {" "}
              An encrypted copy of each backup is kept in Google Drive for the same{" "}
              {D.backupDays} days, then up to {D.driveTrashDays} days in Drive&apos;s trash;
              Google can&apos;t read it.
            </>
          ) : null}
        </li>
        <li>
          <strong>Emails</strong> we sent you stay in your mailbox, and our email account (Gmail)
          keeps a copy of what it sent until the test ends.
        </li>
      </ul>
      <p>
        When the test ends, we delete everything above within 30 days, except the payment
        records the law requires us to keep, as the privacy notice says.
      </p>
      <p>
        We can&apos;t reach other people&apos;s devices: someone you talked to could have kept a
        screenshot, or recorded their screen during a Live call.
      </p>

      <h2>On the waitlist?</h2>
      <p>
        The waitlist isn&apos;t an account. Every waitlist email has a link that deletes your
        address at once, or write to <Contact />.
      </p>
    </DocumentPage>
  );
}
