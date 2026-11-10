# Bugs

The bug register (replica-test format). Severity: S1 data loss, security hole
or core flow blocked; S2 a feature broken with no workaround; S3 broken with a
workaround, or visibly wrong; S4 cosmetic. Only reproduced bugs go here;
suspicions go under "To check". Defects found and fixed inside a stage, before
its commit, are listed in that stage's "Found and fixed" notes in `progress.md`.

Open: S1 0, S2 0, S3 0, S4 1.

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
Status: open. Fix: `z.config({ jitless: true })` before any schema runs, plus an e2e check for CSP violations on the app.

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

## To check

- **Native platforms:** VoiceOver and TalkBack reading order, iOS error announcements, 200% system text, the keystore, the photo picker and realtime reconnection on mobile networks (NAT-1).
- **Cross-site POSTs to console server actions:** no test sends one. Protection: SameSite=Strict cookies and Next.js's Origin-against-Host check.
- **Deletion jobs:** what happens to a photo file whose deletion job fails 8 times (no reconciliation sweep yet).
