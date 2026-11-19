import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = { title: "Terms for testers" };

export default async function Terms() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Terms for testers">
      <p>
        Thanks for helping us test {BRAND}. By creating an account you agree to
        these terms. Our <Link href="/privacy">privacy notice</Link>{" "}
        explains what happens to your data.
      </p>

      <h2>Who can join</h2>
      <ul>
        <li>You are 18 or over.</li>
        <li>You have one account.</li>
        <li>Your profile is about you: your own details and photos of you.</li>
      </ul>

      <h2>Be respectful</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>
          harass, threaten or bully anyone, or keep contacting someone who
          isn&apos;t interested;
        </li>
        <li>
          post hate, nudity or sexual content, or send sexual messages someone
          hasn&apos;t welcomed;
        </li>
        <li>pretend to be someone else;</li>
        <li>
          ask anyone for money, sell things, or send spam or links to scams;
        </li>
        <li>
          share other testers&apos; details, photos or messages outside the app;
        </li>
        <li>do anything illegal, or try to break or overload the app.</li>
      </ul>
      <p>
        Block or report anyone who makes you uncomfortable; people read every
        report. We may warn, suspend or remove accounts that break these terms.
      </p>

      <h2>Stay safe</h2>
      <p>
        We don&apos;t check identities: profiles show only what we actually
        checked (an email address and a declared age). If you meet someone, meet
        in a public place, tell a friend where you&apos;ll be, and get there and
        back on your own. Never send money to someone you met here.
      </p>

      <h2>Live calls</h2>
      <ul>
        <li>
          Live pairs you at random for a short video call with someone whose
          preferences match yours. The rules the app shows before your first
          call are part of these terms.
        </li>
        <li>
          Keep your clothes on and be kind: no nudity, sexual acts, hate or
          harassment. Don&apos;t record, screenshot or share anyone&apos;s call.
        </li>
        <li>
          A report ends the call at once, and the person reported can&apos;t use
          Live until our review team has looked at it.
        </li>
        <li>
          Your first 5 calls are free, up to a minute each. After that, Live
          calls come with {BRAND} Plus.
        </li>
      </ul>

      <h2>{BRAND} Plus</h2>
      <ul>
        <li>
          <strong>What it is</strong>: a pass for a set number of days that
          brings Live calls after your free ones, and longer calls. It never
          changes who sees you or how many likes you get. The app shows the
          price and the number of days before you pay.
        </li>
        <li>
          <strong>Paying</strong>: by UPI, only to the UPI ID the Plus screen
          shows; then you send us the payment&apos;s 12-digit reference. Plus
          starts once we&apos;ve found the payment in our bank account, usually
          within a day. We never ask for money in chats or calls.
        </li>
        <li>
          <strong>No auto-renewal</strong>: a pass simply ends. Buying another
          adds its days after the end of the one you have.
        </li>
        <li>
          <strong>Refunds</strong>: if we can&apos;t confirm your payment, or you
          paid the wrong amount or more than once, write to us and we&apos;ll
          refund it to the account it came from within 7 working days. If we
          end the test or Live while your pass runs, we refund the days left.
          Otherwise a pass that has started isn&apos;t refundable, and it ends
          if you delete your account.
        </li>
      </ul>

      <h2>This is a test</h2>
      <ul>
        <li>
          Things will change, some things will break, and the app may be
          unavailable at times.
        </li>
        <li>
          Everything is free except {BRAND} Plus (above), which you never need
          for anything but Live calls after your free ones.
        </li>
        <li>
          We may use your feedback to improve the app. When the test ends, your
          account and data are deleted (see the privacy notice).
        </li>
        <li>
          You can leave at any time by deleting your account in the app. We may
          end the test at any time.
        </li>
      </ul>

      <h2>Questions</h2>
      <p>
        Write to <Contact />.
      </p>
    </DocumentPage>
  );
}
