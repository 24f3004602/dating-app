import type { Metadata } from "next";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { BRAND } from "@/lib/config";
import { BETA_HOSTING, OPERATOR } from "@/lib/documents";

export const metadata: Metadata = { title: "Privacy notice for testers" };

// Every statement matches what the app does today (privacy-data-inventory.md, D096).
export default async function Privacy() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Privacy notice for testers">
      <h2>Who we are</h2>
      <p>
        {BRAND} is a dating app in development. This test is run by {OPERATOR},
        who decides how your data is used. Questions, requests and complaints go
        to <Contact />. We answer within 7 days.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <strong>Your email and password</strong>, to sign you in and send you
          codes. We keep only a scrambled form (a hash) of your password, never
          the password itself.
        </li>
        <li>
          <strong>Your date of birth</strong>, to check you are 18 or over.
          Other testers see your age, never your date of birth.
        </li>
        <li>
          <strong>Your profile</strong>: name, gender, who you&apos;d like to
          meet, what you&apos;re looking for, your area (picked from a list),
          your bio, answers to prompts, and your photos.
        </li>
        <li>
          <strong>What you do in the app</strong>: likes, passes, matches, your
          messages, blocks and reports, so the app works and stays safe.
        </li>
        <li>
          <strong>Basic security records</strong>: shortened IP addresses, which
          pages were used, and when, to stop abuse and investigate problems.
          Never your messages.
        </li>
        <li>
          <strong>On the Android app, if you turn notifications on</strong>: a
          notification token for your phone.
        </li>
      </ul>
      <p>
        We never ask for your phone&apos;s location, contacts or camera roll
        beyond the photos you choose. We show others your area and a distance
        range, never where you are. We don&apos;t sell your data or use it for
        ads.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Other testers</strong> see your profile and approved photos
          when you appear in their introductions, when you like them, or when
          you match, depending on your privacy settings. Only your match sees
          your messages.
        </li>
        <li>
          <strong>Our small review team</strong> checks each photo before anyone
          else sees it, and handles reports. Staff see a message only when
          someone reports it. Staff sign in with a password and a second code,
          and what they open is recorded.
        </li>
        <li>
          <strong>Services we use</strong>:{" "}
          {BETA_HOSTING === "home" ? (
            <>
              our server is a computer we run ourselves in India, where your
              data is stored. Cloudflare carries the encrypted connection
              between your phone and that computer, so your data passes through
              its network; we mark everything personal so that it isn&apos;t
              kept there.
            </>
          ) : (
            <>
              Amazon Web Services runs our server in Mumbai, India, where your
              data is stored.
            </>
          )}{" "}
          Google (Gmail) sends our emails, so it handles your email address and
          the codes. On the Android app, Expo and Google deliver notifications;
          these say only things like &quot;You have a new message.&quot;, never
          names or message text.
        </li>
      </ul>

      <h2>How we protect it</h2>
      <p>
        Everything travels over encrypted connections (HTTPS). Photos are only
        reachable through short-lived private links. Messages are not end-to-end
        encrypted: they are stored on our server so the app can show your
        conversations. No system is perfect; if a breach affects you, we will
        tell you without delay.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          You can delete your account at any time in the app. You&apos;re hidden
          at once, and your data is deleted after 7 days (you can change your
          mind until then). If a report about your account is still open, the
          deletion waits until it&apos;s handled, at most 30 days.
        </li>
        <li>
          A few safety records stay until the test ends: reports (with a copy of
          any reported message) and moderation decisions, which no longer show
          who you are once your account is deleted.
        </li>
        <li>
          When the test ends, we delete the server and everything on it,
          including backups, within 30 days, and the emails we sent.
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        You can see and change your profile in the app, pause it, choose who
        sees it, and delete your account. To ask for a copy of your data, a
        correction, or anything else, or to complain, write to <Contact />.
        Taking part is your choice, and you can stop at any time.
      </p>
    </DocumentPage>
  );
}
