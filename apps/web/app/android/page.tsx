import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { DocumentPage } from "@/app/DocumentPage";
import { ANDROID_MIN, APK_URL, CERT_SHA256, RELEASES_URL } from "@/lib/android";
import { APP_URL, BRAND } from "@/lib/config";

export const metadata: Metadata = {
  title: "Android app",
  description: "Download the Android app, free, straight from us until it is on Google Play.",
};

/**
 * The Android download (stage 28c, D154; the free launch, D151): the APK from the latest GitHub
 * Release, signed with the app's own key. Honest about the warnings Android shows for an app from
 * outside Google Play, and about the web app as the way in with nothing to install.
 */
export default async function AndroidApp() {
  await connection(); // rendered per request, so the CSP nonce applies
  const appHost = new URL(APP_URL).host;
  return (
    <DocumentPage title={`${BRAND} for Android`} versioned={false}>
      <p>
        The Android app, free, straight from us while it isn&apos;t on Google Play yet. It needs{" "}
        {ANDROID_MIN}, and about 50 MB.
      </p>
      <p>
        <a className="button" href={APK_URL}>
          Download the app
        </a>
      </p>

      <h2>Installing it</h2>
      <ol>
        <li>
          Tap <strong>Download the app</strong>. Your browser may warn that the file could harm your
          phone: it says that about every app from outside Google Play.
        </li>
        <li>Open the downloaded file.</li>
        <li>
          Android asks whether your browser may install apps. Allow it for this install; you can turn
          it off again afterwards (Settings, Apps, Special app access, Install unknown apps).
        </li>
        <li>
          Tap <strong>Install</strong>, then open {BRAND}, and sign in or create your account.
        </li>
      </ol>
      <p>
        Google Play Protect may scan it first, because it isn&apos;t on Google Play yet. That&apos;s
        expected.
      </p>

      <h2>Only from here</h2>
      <p>
        Download {BRAND} only from this page. Every version is signed with our own key, and Android
        installs an update only when it is signed with the same key, so an app pretending to be ours
        can&apos;t replace it. For the technically minded, the key&apos;s certificate (SHA-256) is{" "}
        <code className="secret">{CERT_SHA256}</code>, and each version&apos;s file checksum is on{" "}
        <a href={RELEASES_URL}>its release page</a>.
      </p>

      <h2>Updates</h2>
      <p>
        When there&apos;s a new version, download it here again and install it over the old one: your
        account and settings stay.
      </p>

      <h2>Nothing to install</h2>
      <p>
        The web app at <a href={`${APP_URL}/welcome`}>{appHost}</a> does everything the Android app
        does, in your phone&apos;s browser. In Chrome, open the menu and choose{" "}
        <strong>Add to home screen</strong> (or <strong>Install app</strong>) to keep it beside your
        other apps.
      </p>

      <h2>Removing it</h2>
      <p>
        Uninstalling the app doesn&apos;t delete your account. To delete it, see{" "}
        <Link href="/delete-account">Delete your account</Link>.
      </p>
    </DocumentPage>
  );
}
