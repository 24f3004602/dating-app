import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { GAC_URL, LIMITS, RULES_AMENDED, URGENT_SUBJECT } from "@/lib/complaints";
import { BRAND } from "@/lib/config";
import { OPERATOR } from "@/lib/documents";

export const metadata: Metadata = {
  title: "Complaints",
  description: "How to complain, who the grievance officer is, and how fast India's IT Rules say we must act.",
};

/**
 * Complaints and the grievance officer (stage 28d, D155): the officer's name and contact and the
 * ways to complain, which India's IT Rules, 2021 (rule 3(2)) make us publish where the home page
 * links to it, with the limits the rules set (lib/complaints.ts, from the rules' own text). The
 * officer is the operator (OPERATOR_NAME, which a production website can't start without).
 * Written in English, like the privacy notice and the terms.
 */
export default async function Complaints() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Complaints and the grievance officer" versioned={false}>
      <p>
        If someone on {BRAND} has broken our terms or the law, or something here has harmed you,
        tell us. You don&apos;t need an account to complain.
      </p>
      <p>
        <strong>In danger right now?</strong> Call 112, India&apos;s emergency number.
      </p>

      <h2>The grievance officer</h2>
      <p>
        <strong>Grievance officer:</strong> {OPERATOR}
        <br />
        <strong>Email:</strong> <Contact />
      </p>
      <p>
        The person India&apos;s IT Rules, 2021 ask us to name to receive and decide complaints about{" "}
        {BRAND}.
      </p>

      <h2>Report it in the app</h2>
      <p>
        If you have an account, this is the quickest way. On their profile, in your chat with them
        (from its options), or during a Live call, choose <strong>Report</strong>, then what happened.
        You can block them at the same time. Your reports and where each one stands are under{" "}
        <strong>You</strong>, then <strong>Safety</strong>.
      </p>

      <h2>Or write to us</h2>
      <p>
        For anything else, or without an account (if someone is using your photos, say), email{" "}
        <Contact /> with:
      </p>
      <ul>
        <li>
          what happened, and where: the profile&apos;s first name, age and area as the app shows
          them, or the day and time of a message or call;
        </li>
        <li>how we can reach you, and whether you&apos;re writing for someone else.</li>
      </ul>
      <p>
        If an image shows you naked or in a sexual act, or pretends to be you (a morphed or AI-made
        image included), start the subject with <strong>{URGENT_SUBJECT}</strong>. Don&apos;t send
        the image itself, even of yourself: tell us where you saw it, and we&apos;ll find it.
      </p>

      <h2>How fast we must act</h2>
      <p>India&apos;s IT Rules, 2021, as amended on {RULES_AMENDED}, set these limits:</p>
      <ul>
        <li>
          <strong>Every complaint</strong>: acknowledged within {LIMITS.acknowledge}, and resolved
          within {LIMITS.resolve}.
        </li>
        <li>
          <strong>A request to remove something the rules forbid</strong>, such as sexual or obscene
          content, invading someone&apos;s privacy, harassment or hate, anything harmful to a child,
          pretending to be someone else, deliberately false information, or incitement to a crime:
          resolved within {LIMITS.removal}.
        </li>
        <li>
          <strong>An image or video that shows you naked or in a sexual act, or pretends to be you</strong>:
          removed, or blocked so no one can see it, within {LIMITS.intimate} of your complaint.
        </li>
      </ul>

      <h2>If you disagree</h2>
      <p>
        If you disagree with the grievance officer&apos;s decision, or we don&apos;t resolve your
        complaint in time, you can appeal to the Grievance Appellate Committee, which the Government
        of India set up for this, at <a href={GAC_URL}>gac.gov.in</a>, within {LIMITS.appeal} of our
        reply. Appealing doesn&apos;t stop you from going to the police or a court.
      </p>
      <p>
        Fraud, blackmail, or someone sharing intimate images of you can also be reported to the
        police at <a href="https://cybercrime.gov.in">cybercrime.gov.in</a> or on 1930.
      </p>

      <h2>Courts and government</h2>
      <p>
        Orders and notices from a court or a government agency go to the same address:{" "}
        <Contact />.
      </p>

      <h2>Your personal data</h2>
      <p>
        To see, correct or delete what we hold about you, see the{" "}
        <Link href="/privacy">privacy notice</Link> and{" "}
        <Link href="/delete-account">Delete your account</Link>. Questions about it go to the same
        address.
      </p>
    </DocumentPage>
  );
}
