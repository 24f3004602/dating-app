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
        Thanks for helping us test {BRAND}. By creating an account you agree to these terms. Our{" "}
        <Link href="/privacy">privacy notice for testers</Link> explains what happens to your data.
      </p>

      <h2>Who can join</h2>
      <ul>
        <li>You are 18 or over.</li>
        <li>You were invited, and you have one account.</li>
        <li>Your profile is about you: your own details and photos of you.</li>
      </ul>

      <h2>Be respectful</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>harass, threaten or bully anyone, or keep contacting someone who isn&apos;t interested;</li>
        <li>post hate, nudity or sexual content, or send sexual messages someone hasn&apos;t welcomed;</li>
        <li>pretend to be someone else;</li>
        <li>ask anyone for money, sell things, or send spam or links to scams;</li>
        <li>share other testers&apos; details, photos or messages outside the app;</li>
        <li>do anything illegal, or try to break or overload the app.</li>
      </ul>
      <p>
        Block or report anyone who makes you uncomfortable; people read every report. We may warn, suspend or remove
        accounts that break these terms.
      </p>

      <h2>Stay safe</h2>
      <p>
        We don&apos;t check identities: profiles show only what we actually checked (an email address and a declared
        age). If you meet someone, meet in a public place, tell a friend where you&apos;ll be, and get there and back
        on your own.
      </p>

      <h2>This is a test</h2>
      <ul>
        <li>Things will change, some things will break, and the app may be unavailable at times.</li>
        <li>Nothing is for sale, and nothing costs money.</li>
        <li>
          We may use your feedback to improve the app. When the test ends, your account and data are deleted (see the
          privacy notice).
        </li>
        <li>You can leave at any time by deleting your account in the app. We may end the test at any time.</li>
      </ul>

      <h2>Questions</h2>
      <p>
        Write to <Contact />.
      </p>
    </DocumentPage>
  );
}
