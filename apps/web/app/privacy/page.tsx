import type { Metadata } from "next";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { BRAND } from "@/lib/config";
import { BETA_HOSTING, OPERATOR } from "@/lib/documents";

export const metadata: Metadata = { title: "Privacy notice" };

// Every statement matches what the app does today (privacy-data-inventory.md, D096).
export default async function Privacy() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Privacy notice">
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
        We never ask for your phone&apos;s location or contacts, or for your
        camera roll beyond the photos you choose. Live uses your camera and
        microphone only during its calls. We show others your area and a
        distance range, never where you are. We don&apos;t sell your data or use
        it for ads.
      </p>

      <h2>If you sign in with Google</h2>
      <ul>
        <li>
          <strong>What Google tells us</strong>: your Google account&apos;s ID
          number, your email address and whether Google has checked it, and your
          name. We keep the ID number and the email address, to know it&apos;s
          you next time. We don&apos;t keep your name. We ask Google for nothing
          else: no contacts, no photos, and no access to your Google account.
        </li>
        <li>
          <strong>What Google learns</strong>: that you signed in to {BRAND},
          under Google&apos;s own privacy policy. We send Google nothing about
          you or what you do in the app.
        </li>
        <li>
          <strong>Your account</strong>: if you already have an account with a
          Gmail address (or a work address Google runs), signing in with Google
          opens it. An account made with Google has no password until you set
          one with &quot;Forgot your password?&quot;; to delete it, you choose
          your Google account again. The link to your Google account is deleted
          with your account.
        </li>
      </ul>

      <h2>If you use Live</h2>
      <ul>
        <li>
          <strong>Your camera and microphone</strong>, only while you&apos;re on
          a call. The video and sound go between your device and the other
          person&apos;s through Cloudflare&apos;s relay servers, so neither of
          you is shown the other&apos;s IP address. They never reach our server,
          and we don&apos;t record calls. Cloudflare&apos;s relay sees both
          devices&apos; IP addresses, to connect them.
        </li>
        <li>
          <strong>The other person</strong> sees and hears you during the call,
          with your first name and age. They could record their screen, so
          don&apos;t share anything you&apos;d regret.
        </li>
        <li>
          <strong>What we keep</strong>: that you accepted the Live rules, and
          when; how many of your free calls you&apos;ve used; and for each call,
          who was paired with whom, when, how long it lasted and how it ended,
          for 90 days, or longer only while a report names the call. The
          technical details the two devices exchange to connect pass through
          our server and are deleted when the call ends. While you wait to be
          paired, we note that you&apos;re waiting, deleted within an hour.
        </li>
        <li>
          <strong>Reports</strong> made from a call tell our review team which
          call it was. Someone reported from a call can&apos;t use Live until
          the report has been handled.
        </li>
      </ul>

      <h2>If you buy {BRAND} Plus</h2>
      <ul>
        <li>
          <strong>Paying</strong>: you pay by UPI from your own UPI app,
          straight to our UPI ID. Your bank, your UPI app and NPCI handle the
          payment under their own terms. We never see your bank details or UPI
          PIN, and we don&apos;t ask for your UPI ID.
        </li>
        <li>
          <strong>What we keep</strong>: the payment&apos;s code and amount, the
          12-digit UPI reference you send us, when you sent it, what we decided
          after checking our bank account, and the dates your pass runs. An
          admin checks each payment against our bank account.
        </li>
        <li>
          <strong>How long</strong>: a payment you start but never send a
          reference for is deleted after 30 days. The rest are accounting
          records, which the law requires us to keep, so we keep them for 8
          years, even after you delete your account; from then on they no
          longer show which account they belonged to.
        </li>
      </ul>

      <h2>Ads in the Android app</h2>
      <ul>
        <li>
          <strong>Where</strong>: members without {BRAND} Plus may see ads from
          Google AdMob in the Android app: a banner at the foot of Today, Likes
          and Matches, and now and then a full-screen ad when you come back to
          Today after deciding about a few people. Never in chats, Live calls,
          profiles, Safety, payments or sign-up, and never in your first day.
          The web app has no ads.
        </li>
        <li>
          <strong>What Google receives</strong>: your phone&apos;s advertising
          ID, its IP address, the kind of phone and app, and what happens with
          each ad (shown, tapped), to show ads, limit how often you see them,
          measure them and stop fraud, under Google&apos;s own privacy policy
          and for as long as it keeps such data.
        </li>
        <li>
          <strong>What we ask for</strong>: non-personalised ads only, suitable
          for teens and up, so they aren&apos;t chosen from your activity in
          other apps or sites. We send Google nothing from your account: not
          your name, profile, preferences, matches, messages or calls.
        </li>
        <li>
          <strong>Your choices</strong>: with Plus you see no ads, and your app
          doesn&apos;t start Google&apos;s ad service at all. You can also
          delete or reset your advertising ID in Android&apos;s settings
          (Privacy, then Ads).
        </li>
      </ul>

      <h2>If you joined the waitlist</h2>
      <p>
        The waitlist closed when sign-up opened to everyone: no new addresses are added.
        For the addresses already on it:
      </p>
      <ul>
        <li>
          <strong>What we keep</strong>: your email address, when you joined and
          confirmed it, and which version of this notice you saw. You tell us
          you&apos;re 18 or over; we ask for nothing else.
        </li>
        <li>
          <strong>Why</strong>: to send you a link to confirm the address, and
          then one email when {BRAND} opens. Nothing else: no newsletters, no
          ads, and we never share or sell it. Google (Gmail) sends these emails.
        </li>
        <li>
          <strong>How long</strong>: if you don&apos;t confirm, the address is
          deleted when the link expires, after 7 days. Once confirmed, we keep
          it until 30 days after the opening email, and never longer than a
          year.
        </li>
        <li>
          <strong>Leaving</strong>: every waitlist email has a link that deletes
          your address at once. You can also write to <Contact />.
        </li>
      </ul>

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
          the codes. Cloudflare&apos;s relay servers carry Live calls between the
          two devices. On the Android app, Expo and Google deliver notifications;
          these say only things like &quot;You have a new message.&quot;, never
          names or message text. Google AdMob shows the Android app&apos;s ads to
          members without Plus (above).
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
          including backups, within 30 days, and the emails we sent, except
          the payment records the law requires us to keep (above).
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
