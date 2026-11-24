// ANDROID-PAGE-1 (D154): the website's download link is the file the android-apk workflow
// publishes, as the latest release, signed with the key whose certificate the page shows.
// (Node strips the types from lib/android.ts.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { APK_FILE, APK_URL, CERT_SHA256, RELEASES_URL } from "../lib/android.ts";

const workflow = readFileSync(resolve(import.meta.dirname, "../../../.github/workflows/android-apk.yml"), "utf8");

test("ANDROID-PAGE-1: the link is the workflow's latest kinaara.apk; the certificate is well formed", () => {
  assert.equal(APK_FILE, "kinaara.apk");
  assert.match(APK_URL, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/latest\/download\/kinaara\.apk$/);
  assert.equal(RELEASES_URL, APK_URL.replace(/\/download\/kinaara\.apk$/, ""));
  // The workflow publishes that very file name, marked latest.
  assert.match(workflow, /cp apk\/app-release\.apk kinaara\.apk/);
  assert.match(workflow, /gh release create "\$tag" kinaara\.apk kinaara\.apk\.sha256 [^\n]*--latest/);
  // And refuses an APK whose certificate isn't the one the repository variable names.
  assert.match(workflow, /certificate SHA-256 digest/);
  assert.match(CERT_SHA256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});
