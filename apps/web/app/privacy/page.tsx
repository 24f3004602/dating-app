import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Contact, DocumentPage } from "@/app/DocumentPage";
import { LIMITS } from "@/lib/complaints";
import { BRAND } from "@/lib/config";
import { DELETION as D, span } from "@/lib/deletion";
import { BETA_DATE, BETA_HOSTING, OPERATOR } from "@/lib/documents";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * The privacy notice (stage 18, D096; this version stage 29e-1, D163). Every statement matches what
 * the app does today: privacy-data-inventory.md, the retention periods in the API's
 * modules/privacy/retention.py (PRIV-DOC-1 holds the numbers to them), and the live settings
 * (ads and push notifications are switched off). Change the text and the version together.
 */
export default async function Privacy() {
  await connection(); // rendered per request, so the CSP nonce applies
  return (
    <DocumentPage title="Privacy notice">
      <h2>What changed on {BETA_DATE}</h2>
      <ul>
        <li>
          {BRAND} is open across India: your area can be a town anywhere in India, picked from a
          list, as well as an area in Delhi NCR.
        </li>
        <li>
          You can add LGBTQ+ labels to your profile if you want to. They can say something
          sensitive about you, so below we say exactly who sees them and what they&apos;re used for.
        </li>
        <li>Live has an LGBTQ+ space you can choose, and now keeps to the distance you chose.</li>
        <li>Your introductions put people nearer to you first.</li>
      </ul>

      <h2>Who we are</h2>
      <p>
        {BRAND} is a dating app in development. This test is run by {OPERATOR}, who decides how
        your data is used and is our grievance officer. Questions, requests and complaints go to{" "}
        <Contact />, or see <Link href="/complaints">Complaints and the grievance officer</Link>.
        We answer within {LIMITS.resolve}.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <strong>Your email and password</strong>, to sign you in and send you codes and notices
          about your account. We keep only a scrambled form (a hash) of your password, never the
          password itself.
        </li>
        <li>
          <strong>Your date of birth</strong>, to check you are 18 or over. Others see your age,
          never your date of birth.
        </li>
        <li>
          <strong>Your profile</strong>: name, gender, who you&apos;d like to meet, what
          you&apos;re looking for, your area (an area in Delhi NCR or a town anywhere in India,
          picked from a list), your bio, answers to prompts, and your photos.
        </li>
        <li>
          <strong>LGBTQ+ labels, only if you add them</strong>: up to three of trans, gay,
          lesbian, bisexual, queer, pansexual, asexual, intersex and questioning. They can say
          something sensitive about you, such as your sexual orientation or gender identity, so
          they are entirely your choice: none is set unless you add it, we never ask you to, and
          we never guess. They show on your profile to anyone who can see it. We don&apos;t use
          them to choose your introductions; on Live, a label lets you choose the LGBTQ+ space
          (below). You can remove them at any time.
        </li>
        <li>
          <strong>What you do in the app</strong>: likes (and any comment with them), passes,
          matches, your messages, blocks and reports, so the app works and stays safe.
        </li>
        <li>
          <strong>Your agreement</strong>: which versions of the terms and this notice you agreed
          to, and when.
        </li>
        <li>
          <strong>Basic security records</strong>: shortened IP addresses, which pages were used,
          and when, to stop abuse and investigate problems. Never your messages.
        </li>
        <li>
          <strong>On your device</strong>: a sign-in key that keeps you signed in for up to{" "}
          {span(D.sessionDays, "day")}. On a phone it sits in the phone&apos;s secure storage. In the web app it&apos;s a
          cookie that only our server can read, not the page&apos;s own code; if you untick
          &quot;Keep me signed in on this browser&quot;, it goes when you close the browser. The app tour also
          remembers, on your device only, whether you&apos;ve answered its offer and whether it
          reads aloud.
        </li>
      </ul>
      <p>
        We never ask for your phone&apos;s location or contacts, or for your camera roll beyond the
        photos you choose. Live uses your camera and microphone only during its calls. We show
        others your area or town and a distance range, never where you are: distances are
        measured between the centres of the areas you each picked. We don&apos;t sell your data or
        use your profile or activity for advertising, and we use no analytics. Our website uses no
        cookies, except for our team&apos;s own sign-in to the console.
      </p>
      <p>
        <strong>Switched off for now</strong>: push notifications (the app doesn&apos;t ask for a
        notification token, so nothing about you goes to Expo, Google or Apple for them), and ads
        (the app we publish shows none; the Android app contains Google&apos;s AdMob code, but
        while ads are off the app never starts it). Before we switch either on, we&apos;ll update
        this notice and say exactly what each service receives.
      </p>

      <h2>If you sign in with Google</h2>
      <ul>
        <li>
          <strong>What Google tells us</strong>: your Google account&apos;s ID number, your email
          address and whether Google has checked it, and your name. We keep the ID number and the
          email address, to know it&apos;s you next time. We don&apos;t keep your name. We ask
          Google for nothing else: no contacts, no photos, and no access to your Google account.
        </li>
        <li>
          <strong>What Google learns</strong>: that you signed in to {BRAND}, under Google&apos;s
          own privacy policy. We send Google nothing about you or what you do in the app.
        </li>
        <li>
          <strong>Your account</strong>: if you already have an account with a Gmail address (or a
          work address Google runs), signing in with Google opens it. An account made with Google
          has no password until you set one with &quot;Forgot your password?&quot;; to delete it,
          you choose your Google account again. The link to your Google account is deleted with
          your account.
        </li>
      </ul>

      <h2>If you use Live</h2>
      <ul>
        <li>
          <strong>Your camera and microphone</strong>, only while you&apos;re on a call. The video
          and sound go between your device and the other person&apos;s through Cloudflare&apos;s
          relay servers, so neither of you is shown the other&apos;s IP address. They never reach
          our server, and we don&apos;t record calls. Cloudflare&apos;s relay sees both
          devices&apos; IP addresses, to connect them.
        </li>
        <li>
          <strong>The other person</strong> sees and hears you during the call, with your first
          name and age. They could record their screen, so don&apos;t share anything you&apos;d
          regret.
        </li>
        <li>
          <strong>Who you&apos;re paired with</strong>: someone whose preferences fit yours, and
          yours theirs, in gender, age and, if either of you chose one, distance. Neither of you is
          shown the other&apos;s area or distance on the call.
        </li>
        <li>
          <strong>The LGBTQ+ space</strong>: if your profile has an LGBTQ+ label, you can choose to
          meet only others who chose the space. We keep that choice, and it applies only while
          your profile has a label. Everyone you meet there chose it too, so each of you knows the
          other did.
        </li>
        <li>
          <strong>What we keep</strong>: that you accepted the Live rules, and when; how many of
          your free calls you&apos;ve used; whether you chose the LGBTQ+ space; and for each call, who was paired with whom, when, how
          long it lasted and how it ended, for {span(D.callRecordDays, "day")}, or longer only while a
          report names the call. The technical details the two devices exchange to connect pass through our server
          and are deleted when the call ends. While you wait to be paired, we note that
          you&apos;re waiting, deleted within {span(D.queueHours, "hour")}.
        </li>
        <li>
          <strong>Reports</strong> made from a call tell our review team which call it was. Someone
          reported from a call can&apos;t use Live until the report has been handled.
        </li>
      </ul>

      <h2>If you buy {BRAND} Plus</h2>
      <ul>
        <li>
          <strong>Paying</strong>: you pay by UPI from your own UPI app, straight to our UPI ID.
          Your bank, your UPI app and NPCI handle the payment under their own terms. We never see
          your bank details or UPI PIN, and we don&apos;t ask for your UPI ID.
        </li>
        <li>
          <strong>What we keep</strong>: the payment&apos;s code and amount, the 12-digit UPI
          reference you send us, when you sent it, what we decided after checking our bank
          account, and the dates your pass runs. An admin checks each payment against our bank
          account.
        </li>
        <li>
          <strong>How long</strong>: a payment you start but never send a reference for is deleted
          after {span(D.unpaidPaymentDays, "day")}. The rest are accounting records, which the law
          requires us to keep, so we keep them for {span(D.paymentYears, "year")}, even after you delete your account; from then on they no longer
          show which account they belonged to.
        </li>
      </ul>

      <h2>If you download the Android app</h2>
      <p>
        The app&apos;s file is kept on GitHub (owned by Microsoft), and our{" "}
        <Link href="/android">Android page</Link> links to it. When you download it, GitHub sees
        your IP address and your browser&apos;s details, under GitHub&apos;s own privacy statement.
        It learns nothing about your {BRAND} account.
      </p>

      <h2>If you joined the waitlist</h2>
      <p>
        The waitlist closed when sign-up opened to everyone: no new addresses are added. For the
        addresses already on it:
      </p>
      <ul>
        <li>
          <strong>What we keep</strong>: your email address, when you joined and confirmed it, and
          which version of this notice you saw. You tell us you&apos;re 18 or over; we ask for
          nothing else.
        </li>
        <li>
          <strong>Why</strong>: to send you a link to confirm the address, and then one email when{" "}
          {BRAND} opens. Nothing else: no newsletters, no ads, and we never share or sell it.
          Google (Gmail) sends these emails.
        </li>
        <li>
          <strong>How long</strong>: if you don&apos;t confirm, the address is deleted when the
          link expires, after {span(D.waitlistLinkDays, "day")}. Once confirmed, we keep it until{" "}
          {span(D.waitlistAfterOpeningDays, "day")} after the opening email, and never longer than{" "}
          {span(D.waitlistMaxYears, "year")}.
        </li>
        <li>
          <strong>Leaving</strong>: every waitlist email has a link that deletes your address at
          once. You can also write to <Contact />.
        </li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Other testers</strong> see your profile, including any LGBTQ+ labels you added,
          and your approved photos when you appear in
          their introductions, when you like them, or when you match, depending on your privacy
          settings. Only your match sees your messages.
        </li>
        <li>
          <strong>Our small review team</strong> checks each photo before anyone else sees it, and
          handles reports and complaints. A photo reported as sexual or as pretending to be someone
          is hidden from everyone but you at once, until the team decides; if they find nothing
          wrong, it comes back. Staff see a message only when someone reports it, and the console
          never shows them your email address or your LGBTQ+ labels. To act on a complaint sent by email, they can find an account by
          its email address, or by the name and age its profile shows; each search is recorded,
          but not what was searched for. Staff sign in with a password and a second code, and what
          they open is recorded.
        </li>
        <li>
          <strong>Services we use</strong>:{" "}
          {BETA_HOSTING === "home" ? (
            <>
              our server is a computer we run ourselves in India, where your data is stored.
              Cloudflare carries the encrypted connection between your phone and that computer, so
              your data passes through its network; we mark everything personal so that it
              isn&apos;t kept there.
            </>
          ) : (
            <>Amazon Web Services runs our server in Mumbai, India, where your data is stored.</>
          )}{" "}
          Copies of our daily backups are kept in our Google Drive, encrypted on our computer
          before they leave it, with a key Google doesn&apos;t have, so Google can&apos;t read them.
          Google (Gmail) sends our emails, so it handles your email address and the codes; it also
          carries the alerts our team gets about urgent reports, which name no one.
          Cloudflare&apos;s relay servers carry Live calls between the two devices.
        </li>
        <li>
          <strong>If the app tour reads aloud</strong>: your device&apos;s own voice reads the
          tour&apos;s fixed words. Some browsers&apos; voices, such as Chrome&apos;s
          &quot;Google&quot; voices, are made on their maker&apos;s servers, which then receive
          those words; we send them nothing about you.
        </li>
      </ul>

      <h2>How we protect it</h2>
      <p>
        Everything travels over encrypted connections (HTTPS). Photos are only reachable through
        short-lived private links. Backups are encrypted before they leave our computer. Messages
        are not end-to-end encrypted: they are stored on our server so the app can show your
        conversations. No system is perfect; if a breach affects you, we will tell you without
        delay.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Deleting your account</strong>: you can do it at any time, in the app or the web
          app, or by writing to us from your account&apos;s address if you can&apos;t sign in (see{" "}
          <Link href="/delete-account">Delete your account</Link>). You&apos;re hidden at once, and
          your data is deleted after {span(D.graceDays, "day")}; until then, signing in lets you keep
          the account. If a report about your account is still open, the deletion waits until
          it&apos;s handled, at most {D.reportHoldDays} more days.
        </li>
        <li>
          <strong>What deletion can&apos;t reach</strong>: emails we&apos;ve already sent you, and
          our backups, which keep deleted data until they age out after {span(D.backupDays, "day")}, and
          up to {D.driveTrashDays} more days in Google Drive&apos;s trash, where the copies stay
          encrypted.
        </li>
        <li>
          <strong>Chats</strong>: when a match ends (an unmatch, a block, or either of you
          leaving), the chat closes for both of you at once, and its messages are deleted{" "}
          {span(D.closedChatDays, "day")} later.
        </li>
        <li>
          <strong>Sign-ups never confirmed</strong> are deleted after {span(D.unconfirmedDays, "day")},
          and an account we ban {span(D.bannedDays, "day")} after the ban.
        </li>
        <li>
          <strong>Safety records</strong>: reports (with a copy of any reported message) are kept
          for up to {span(D.reportYears, "year")} after they&apos;re resolved, and stop showing who made
          them after {span(D.reporterLinkDays, "day")}; moderation decisions and our audit log (which
          account did what, by an ID number, never what anyone said), for up to{" "}
          {span(D.auditYears, "year")}. Once your account is deleted, none of them
          shows who you are.
        </li>
        <li>
          <strong>After you leave</strong>: for {span(D.recordYears, "year")}, we keep a record of when you agreed to which
          versions of these documents, and when your account was deleted. For an account we
          banned, we also keep a scrambled form of its email address for that year, so it
          can&apos;t sign up again at once.
        </li>
        <li>
          <strong>Security records</strong> are kept for up to {span(D.securityLogYears, "year")}.
        </li>
        <li>
          <strong>When the test ends</strong>, we delete the server and everything on it, including
          backups, within {span(D.testEndDays, "day")}, and the emails we sent, except the payment records the law
          requires us to keep (above).
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        In the app you can see and change your profile, pause it, choose who sees it, block people,
        and delete your account. To ask for a copy of your data or a summary of what we hold and
        why, a correction, or anything else, write to <Contact />. Deleting your account withdraws
        your agreement to these documents. Complaints go to our grievance officer; if you disagree
        with the answer, you can appeal, as our{" "}
        <Link href="/complaints">complaints page</Link> explains. Taking part is your choice, and
        you can stop at any time.
      </p>
      <p>
        When we change this notice, the new version is dated at the top, with what changed, and we
        tell you in the app.
      </p>
    </DocumentPage>
  );
}
