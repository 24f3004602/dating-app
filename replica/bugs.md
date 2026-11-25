# Bugs

The bug register (replica-test format). Severity: S1 data loss, security hole
or core flow blocked; S2 a feature broken with no workaround; S3 broken with a
workaround, or visibly wrong; S4 cosmetic. Only reproduced bugs go here;
suspicions go under "To check". Defects found and fixed inside a stage, before
its commit, are listed in that stage's "Found and fixed" notes in `progress.md`.

Open: S1 0, S2 0, S3 0, S4 0.

### BUG-001: the 404 page's scripts and styles are blocked by the CSP

- Severity: S4
- Flow / case: web, any unknown address (WEB-4)
- Screen: Next.js's built-in not-found page
- Build: f659d72  Browser / device: Chrome 156, 390 px

Steps
1. Start the production web build (`next start`).
2. Open `/no-such-page`.

Expected: a 404 page with no console errors.
Actual: 18 CSP violations. The built-in not-found page is prerendered without the per-request nonce, so its scripts and inline styles are blocked. The page still shows as plain HTML.
Evidence: the e2e "an unknown page is a plain 404 that keeps the policy" failed with the violations listed.
Suspected cause: static prerendering (no request, so no nonce).
Status: fixed in the stage 15 commit: our own `app/not-found.tsx`, rendered per request; the e2e now passes.

### BUG-002: every app load reports a blocked `eval` under the CSP

- Severity: S4
- Flow / case: app web, any screen (first seen on the welcome screen)
- Screen: all (the shared bundle)
- Build: live beta edge image from `eb80094`  Browser / device: Chrome 156 headless, 390 px

Steps
1. Listen for `securitypolicyviolation` events.
2. Open https://app.kinaara.online/.

Expected: no CSP violations.
Actual: one enforced `script-src` violation, blocked URI `eval`, from the shared bundle (`__common-*.js`, line 170). Nothing breaks and the console shows no error.
Evidence: the 2026-11-07 live check after stage 19 went live; the code at that position is Zod 4.6.7's `allowsEval` probe: `try { new Function("") } catch { ... }`.
Suspected cause: Zod probes for `new Function` unless `jitless` is set. The CSP rightly refuses it, and Zod falls back to its non-eval path. Present since Zod arrived in stage 7b; the app's e2e doesn't listen for CSP violations.
Status: fixed (2026-11-12, D114) and live since 2026-11-13: a headless Chrome check of app.kinaara.online with the violation listener found none. `apps/mobile/src/validation/z.ts` sets `z.config({ jitless: true })`, and every module that builds a schema imports `z` from it. Zod 4.6.7 skips the probe under `jitless`, but reads the setting when each schema is created, so it must run before the first one. MOB-32 records every `Function` made while the app's schemas are built and used: none (without the setting, the probe and a compiled parser). E2E-8: `watchErrors` now reports each `securitypolicyviolation` as a console error, and every spec uses it (onboarding too). A scratch Playwright check under the app's policy in Chrome 156 showed why the suite missed this: the refused `eval` inside a try logged nothing to the console; with the helper it reported one violation, and nothing on a page that keeps the policy. The new check wasn't run against the unfixed build: CI ran it with the fix, and every spec passed with no violation (`b9e7c63`, mobile 43225245517).

### BUG-003: the home-mode backup never saves the photos

- Severity: S3
- Flow / case: running the beta at home, daily backup (BETA-5)
- Screen: none (`infra/beta/backup.sh`)
- Build: `eb80094`  Browser / device: Git Bash 2.51 on Windows 11, Docker Desktop

Steps
1. In `infra/beta`, run `BACKUP_DIR="$HOME/datingapp-backups" ./backup.sh` from Git Bash, as deploy.md's home steps say.

Expected: a database dump and a photo archive.
Actual: the dump is written, then `tar: C:/Program Files/Git/app/var: Cannot open`; exit 2, a 20-byte empty archive, and the 7-day cleanup skipped.
Evidence: the first backup of the live beta, 2026-11-08.
Suspected cause: Git Bash rewrites arguments that look like paths (`/app/var`) into Windows paths before `docker` sees them. CI runs the script on Linux, where this can't happen.
Status: fixed. `backup.sh` sets `MSYS_NO_PATHCONV=1` (ignored on Linux) and now fails unless the archive lists `media/`; the rerun passed (BETA-5).

### BUG-004: on Android, every API call fails as "We couldn't reach the server"

- Severity: S1 (core flow blocked), native builds only. No native build has shipped; testers use the web build, which is unaffected.
- Flow / case: the native app, sign-in (and every other call)
- Screen: Sign in
- Build: working tree on `7210214` (stage 20e slice 2)  Browser / device: Pixel 8 Pro, Android 17, Expo Go 58.0.5, local API over adb port forwarding

Steps
1. Run the app in Expo Go against a local API.
2. Sign in with a valid member's email and password.

Expected: signed in, the You screen.
Actual: "We couldn't reach the server", although the API logged `POST /v1/auth/login` 200 each time. It reproduced three times.
Evidence: a temporary log in the client's catch showed openapi-fetch 0.17.0's own error: "onResponse: must return new Response() when modifying the response".
Suspected cause: confirmed. Our `onResponse` middleware returned the response it was given. openapi-fetch requires anything returned there to be `instanceof Response`, and React Native's fetch responses aren't. The Jest tests use a fake fetch with real `Response` objects, and the first device pass never submitted anything.
Status: fixed (stage 20e slice 2, not yet committed). The middleware returns nothing, which leaves the response unchanged. A new test with a non-`Response` response object failed before the fix and passes after it. Signed in on the phone afterwards.

### BUG-005: every screen under a bar has 44 dp of empty space at the top

- Severity: S4
- Flow / case: the native app, any screen under the stack's top bar or the sign band
- Screen: all but welcome
- Build: working tree on `7210214` (stage 20e slice 2)  Browser / device: Pixel 8 Pro, Android 17, Expo Go 58.0.5, density 544

Steps
1. Open any screen with a top bar (sign in) or a tab (You).

Expected: the screen's 24 dp padding below the bar.
Actual: 68 dp. Measured from view bounds: the band ends at 287 px and the title starts at 519 px. The extra 151 px equals the status bar inset.
Evidence: uiautomator view bounds and the window's `statusBars` inset (151 px); the captures in `apps/mobile/.impeccable/review/slice2/` (git-ignored).
Suspected cause: confirmed. `Screen` padded all four edges with SafeAreaView, so the inset the bar already covers was added again. The web build's top inset is 0, so the browser tests couldn't see it.
Status: fixed (stage 20e slice 2, not yet committed). A `ScreenEdges` context: the stacks leave the top to their bar, the tabs leave the top to the band and the bottom to the line bar, and the welcome screen pads every edge. MOB-20 mutation-checked: removing the fix fails all 3 cases. Measured on the phone afterwards: 24 dp.

### BUG-006: a hidden Tab stop before every switch in the web app

- Severity: S3
- Flow / case: keyboard use of a setting (Privacy's Pause, the notification kinds, the tour's Read it aloud)
- Screen: Privacy, Notifications, the app tour's card
- Build: working tree on `1a96747` (stage 25)  Browser / device: Chrome 1xx through the react-native-web preview

Steps
1. Open the tour's offer and press Tab from the card's heading.

Expected: focus moves to the switch, then to the buttons.
Actual: focus first lands on the switch's label, a box with nothing for a screen reader (it is `aria-hidden`), with the browser's focus ring around it; then the switch.
Evidence: the label rendered as `<div aria-hidden="true" tabindex="0">` (the preview's DOM, 2026-11-20).
Suspected cause: confirmed. React Native Web's Pressable sets `tabIndex` 0 unless one is given, whatever `focusable={false}` says.
Status: fixed (stage 25): the label has `tabIndex={-1}`; MOB-35 checks it (and fails without the fix). After the fix the Tab order is the switch, then the buttons, then the line bar.

### BUG-007: every launch of an APK with Google's ads SDK crashed

- Severity: S1
- Flow / case: opening the Android app
- Screen: none (before the first screen)
- Build: android-apk run 44778292140 (`4ce7784`, `ads: test`)  Browser / device: Pixel 8 Pro, Android 17

Steps
1. Install the APK over the last one and open it.

Expected: the app opens (with test ads for a member without Plus).
Actual: it closed at once: `RuntimeException: Unable to get provider androidx.startup.InitializationProvider`, caused by `Failed to create an instance of androidx.work.impl.WorkDatabase`.
Evidence: logcat on the owner's phone (2026-11-21, 06:30 IST); the APK holds work-runtime 2.7.0, room-runtime 2.2.5 and sqlite 2.1.0, none of which the previous APK had.
Suspected cause: confirmed by the error. Google's ads SDK brings WorkManager 2.7.0, which starts at launch whatever the ads setting, and its Room 2.2.5 creates `WorkDatabase_Impl` by name; R8's full mode (Android Gradle Plugin 8) kept the class but not its no-argument constructor, so Room couldn't instantiate it. Every build with the package would have crashed, ads on or off. The unit and browser tests can't see a release build's shrinking.
Status: fixed (`db7a576`): `-keep class androidx.work.impl.WorkDatabase_Impl { *; }` and the constructors of every `RoomDatabase`, through expo-build-properties. Confirmed on the owner's phone: the APK from android-apk run 44847809342 (SHA-256 `53b4b3b4aa7964fc9f4b2f4510f78bf71ee052d6b1bd5c3719c0f69e30afb36c`, as CI's) opens with no crash. In between, the phone went straight back to the previous APK (run 44671160795).

### BUG-008: a backup could fail without a trace and leave an empty dump

- Severity: S2
- Flow / case: the home-mode daily backup (Task Scheduler, `backup.sh`)
- Screen: none
- Build: `backup.sh` and `schedule-backup.ps1` up to `e31779d`  Browser / device: the owner's laptop (home mode)

Steps
1. Let the scheduled task start (at 03:00, or on sign-in after a missed 03:00).
2. Close its console window, or sign out, before it finishes.

Expected: no file that looks like a backup unless it is complete and checked; the failure is logged.
Actual: a 0-byte `db-20261123T035550Z.dump` with no photo archive, and nothing in `backup.log` (task result 0xC000013A, a closed console).
Evidence: the backup folder and the task's last result, 2026-11-23 (security audit, D141).
Suspected cause: confirmed. The script wrote straight to the final names, checked only at the end and logged only success; the task ran in a visible console window that could be closed mid-run.
Status: fixed (D142). Files are written as `.part`, checked (the dump's table of contents read back; the archive holds `media/`), then named; a failure or a TERM, HUP or INT logs `backup FAILED at <time> (<step>)` and removes its partial files; empty dumps are removed; pruning keeps the newest 3 good backups. The task runs through `conhost --headless` (no window). `backup-test.sh`: 29 cases pass (17 fail on the old script), also under dash in CI; a fresh backup taken and restored by `restore-check.sh` (40 tables, migration 0017). It still runs only while the owner is signed in; a missed day is caught up at the next sign-in.

### BUG-009: the font test rewrote the Hindi letter list, so a second run passed

- Severity: S3
- Flow / case: WEB-FONT-2 and WEB-FONT-3 (`apps/web/tests/fonts.test.mjs`)
- Screen: none
- Build: up to `9700f24`  Browser / device: the laptop (node --test)

Steps
1. Add a Hindi word with a letter the font subsets may lack (stage 28d: अधिकारी, with ध).
2. Run the website's tests twice.

Expected: both runs fail until the letter list is regenerated on purpose and the fonts are rebuilt.
Actual: the first run failed 2 tests, the second passed: WEB-FONT-3 regenerated `scripts/devanagari-text.txt` in place to compare it, leaving the new list behind, and WEB-FONT-2 checks letters against that list, not against the fonts.
Evidence: `git status` showed the list changed with no edit; the first run 41 of 43, the next six 43 of 43.
Suspected cause: confirmed (the test ran `devanagari-text.mjs`, which wrote into `scripts/`).
Status: fixed. The script takes an output folder; the test regenerates into a temporary one and compares, so a stale list fails on every run (checked: two runs on the old list both fail and leave it untouched). Harmless this time: the committed subsets (13 Nov) already hold ध, from Hindi lines since removed; rebuilt from their own characters they match byte for byte (the source is now pinned in `build_fonts.py`). Still open: the tests check the list, not the font files.

### BUG-010: the Plus pass screen's test read a line before its query had answered

- Severity: S4 (a test only; the screen is right)
- Flow / case: PLUS-APP-1 (`apps/mobile/src/screens/plan.test.tsx`)
- Screen: Plus (the pass)
- Build: up to `7471042`  Browser / device: GitHub Actions (mobile 45529108937, Jest)

Steps
1. Run the app's Jest suite on a busy CI runner.

Expected: PLUS-APP-1 passes every time.
Actual: once in three runs that day it failed: "Unable to find an element with text: One payment by UPI, with no auto-renewal..." (250 of 251 passed; the e2e job was skipped because of it).
Evidence: the CI log of mobile 45529108937; the same test passed on `1a25f3d` and `64c34d7`, and the commit changed no app code.
Suspected cause: confirmed. The price heading comes with the plan query; the pass section, with that line, shows a loader until the member's own payment query answers. The test waited for the price, then looked for the line at once.
Status: fixed. The test waits for the line too (`findByText`); no other test in the file reads the section before waiting for it.

## To check

- **A dev-only "NAVIGATE … was not handled by any navigator" console error** (2026-11-11, Expo Go 58.0.5 on the owner's Pixel 8 Pro). It appeared once, when an `exp://…/--/discover` link was sent to an app still running a bundle from a dev server that had just been stopped. The app still opened on Today. Not reproduced on a cold start with the same link. Check in a development build: open a deep link (a notification, a reset email) while the app is starting.
- **Native platforms:** VoiceOver and TalkBack reading order, iOS error announcements, 200% system text, the keystore, the photo picker and realtime reconnection on mobile networks (NAT-1).
- **Cross-site POSTs to console server actions:** no test sends one. Protection: SameSite=Strict cookies and Next.js's Origin-against-Host check.
- **Deletion jobs:** what happens to a photo file whose deletion job fails 8 times (no reconciliation sweep yet).
