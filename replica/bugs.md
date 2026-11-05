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

## To check

- **Native platforms:** VoiceOver and TalkBack reading order, iOS error announcements, 200% system text, the keystore, the photo picker and realtime reconnection on mobile networks (NAT-1).
- **Cross-site POSTs to console server actions:** no test sends one. Protection: SameSite=Strict cookies and Next.js's Origin-against-Host check.
- **Deletion jobs:** what happens to a photo file whose deletion job fails 8 times (no reconciliation sweep yet).
