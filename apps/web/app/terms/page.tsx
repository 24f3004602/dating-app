import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { BRAND } from "@/lib/config";
import { BETA_DATE } from "@/lib/documents";

export const metadata: Metadata = { title: "Terms for testers" };

/**
 * The terms for testers (stage 18, D096; this version stage 28f, D159). What members mustn't post
 * follows India's IT Rules, 2021, rule 3(1)(b), in plain words; what happens when rules are broken
 * follows rule 3(1)(c), which also asks for a reminder at least every three months (the app's
 * reminder notice). Change the text and the version together.
 */
export default async function Terms() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Terms for testers">
      <h2>What changed on {BETA_DATE}</h2>
      <ul>
        <li>What you mustn&apos;t post, listed in full, as India&apos;s IT Rules ask.</li>
        <li>
          What happens when the rules are broken, including reporting crimes when the law requires
          it.
        </li>
        <li>
          Complaints go to our grievance officer, with a way to appeal: see{" "}
          <Link href="/complaints">Complaints and the grievance officer</Link>.
        </li>
        <li>There are no ads at the moment.</li>
        <li>You can delete your account in the web app too.</li>
      </ul>

      <p>
        Thanks for helping us test {BRAND}. By creating an account you agree to these terms. Our{" "}
        <Link href="/privacy">privacy notice</Link> explains what happens to your data.
      </p>

      <h2>Who can join</h2>
      <ul>
        <li>You are 18 or over.</li>
        <li>You have one account.</li>
        <li>
          Your profile is about you: your own details and photos of you, not of anyone else, and
          not edited or AI-made images that show someone else.
        </li>
        <li>
          You use {BRAND} for yourself, to meet people: not for a business, an agency or anyone
          else.
        </li>
      </ul>

      <h2>What you mustn&apos;t post or do</h2>
      <p>Don&apos;t post, send or share anything that:</p>
      <ul>
        <li>
          harasses, threatens or bullies anyone (and don&apos;t keep contacting someone who
          isn&apos;t interested);
        </li>
        <li>
          is sexual, nude or obscene, including sexual messages someone hasn&apos;t welcomed;
        </li>
        <li>involves anyone under 18 in anything sexual, or is otherwise harmful to children;</li>
        <li>
          invades someone&apos;s privacy, including their body, such as an intimate image shared
          without their consent;
        </li>
        <li>
          insults or targets people for their gender, race, caste, religion or community, or stirs
          up hatred or violence between groups;
        </li>
        <li>
          pretends to be someone else, including with their photos or an edited or AI-made image;
        </li>
        <li>is meant to deceive: lies about who you are, or information you know is false;</li>
        <li>
          belongs to someone else when you have no right to share it, or breaks a copyright or
          trademark;
        </li>
        <li>
          asks for money, sells things, promotes gambling, betting or money laundering, or is spam
          or a link to a scam;
        </li>
        <li>
          threatens India&apos;s unity, security or sovereignty, its relations with other
          countries or public order, encourages a crime, or obstructs an investigation;
        </li>
        <li>contains a virus or other harmful code;</li>
        <li>breaks any law.</li>
      </ul>
      <p>And don&apos;t:</p>
      <ul>
        <li>
          offer, ask for or pay for dates or company in return for money, gifts or favours,
          including &quot;sugar&quot; arrangements;
        </li>
        <li>
          run or promote a matchmaking, marriage or introduction service, including one that
          introduces people from other countries;
        </li>
        <li>share other testers&apos; details, photos or messages outside the app;</li>
        <li>try to break, overload or get around the app&apos;s protections.</li>
      </ul>
      <p>Block or report anyone who makes you uncomfortable; people read every report.</p>

      <h2>When the rules are broken</h2>
      <ul>
        <li>
          We can remove anything that breaks these terms, and warn, suspend or ban the account
          responsible, at once if we need to. A suspended or banned account can&apos;t be used.
        </li>
        <li>
          Breaking the law on {BRAND} can also be a crime: whoever is responsible may face
          penalties or punishment under the Information Technology Act or other laws.
        </li>
        <li>
          When the law requires us to report a crime, we report it to the police or the right
          authority: for example, anything sexual involving a child, under the Protection of
          Children from Sexual Offences Act.
        </li>
        <li>
          If you think we got a decision wrong, tell our grievance officer (below).
        </li>
        <li>
          We remind you of these rules in the app at least every three months, as India&apos;s IT
          Rules ask.
        </li>
      </ul>

      <h2>Stay safe</h2>
      <p>
        We don&apos;t check identities: profiles show only what we actually checked (an email
        address and a declared age). If you meet someone, meet in a public place, tell a friend
        where you&apos;ll be, and get there and back on your own. Never send money to someone you
        met here. Get the Android app only from our <Link href="/android">Android page</Link>:
        copies from anywhere else may not be ours.
      </p>

      <h2>Live calls</h2>
      <ul>
        <li>
          Live pairs you at random for a short video call with someone whose preferences match
          yours. The rules the app shows before your first call are part of these terms.
        </li>
        <li>
          Keep your clothes on and be kind: no nudity, sexual acts, hate or harassment. Don&apos;t
          record, screenshot or share anyone&apos;s call.
        </li>
        <li>
          A report ends the call at once, and the person reported can&apos;t use Live until our
          review team has looked at it.
        </li>
        <li>
          Your first 5 calls are free, up to a minute each. After that, Live calls come with{" "}
          {BRAND} Plus.
        </li>
      </ul>

      <h2>{BRAND} Plus</h2>
      <ul>
        <li>
          <strong>What it is</strong>: a pass for a set number of days that brings Live calls after
          your free ones, and longer calls. It never changes who sees you or how many likes you
          get. The app shows the price and the number of days before you pay.
        </li>
        <li>
          <strong>Paying</strong>: by UPI, only to the UPI ID the Plus screen shows; then you send
          us the payment&apos;s 12-digit reference. Plus starts once we&apos;ve found the payment in
          our bank account, usually within a day. We never ask for money in chats or calls.
        </li>
        <li>
          <strong>No ads</strong>: there are none at the moment. If we switch them on in the
          Android app, members with Plus won&apos;t see any.
        </li>
        <li>
          <strong>No auto-renewal</strong>: a pass simply ends. Buying another adds its days after
          the end of the one you have.
        </li>
        <li>
          <strong>Refunds</strong>: if we can&apos;t confirm your payment, or you paid the wrong
          amount or more than once, write to us and we&apos;ll refund it to the account it came
          from within 7 working days. If we end the test or Live while your pass runs, we refund
          the days left. Otherwise a pass that has started isn&apos;t refundable, and it ends if you
          delete your account.
        </li>
      </ul>

      <h2>Complaints</h2>
      <p>
        Report anything in the app, or write to our grievance officer:{" "}
        <Link href="/complaints">Complaints and the grievance officer</Link> gives their name, how
        to reach them, how fast we must act, and how to appeal.
      </p>

      <h2>This is a test</h2>
      <ul>
        <li>
          Things will change, some things will break, and the app may be unavailable at times.
        </li>
        <li>
          Everything is free except {BRAND} Plus (above), which you never need for anything but
          Live calls after your free ones.
        </li>
        <li>
          We may use your feedback to improve the app. When the test ends, your account and data
          are deleted (see the privacy notice).
        </li>
        <li>
          You can leave at any time by deleting your account, in the app or the web app. We may
          end the test at any time.
        </li>
        <li>
          When we change these terms, the new version is dated at the top, with what changed, and
          we tell you in the app.
        </li>
      </ul>

      <h2>Questions</h2>
      <p>
        Write to <Contact />.
      </p>
    </DocumentPage>
  );
}
