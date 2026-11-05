# Security threat model

Date: 2026-11-04. Scope: the MVP in `architecture.md`. The `status` column
says how far each control has got: `planned`, `partial` (some code and tests;
the rest is named) or `done` (code plus a passing test, see `test-plan.md`).
Nothing is `done` until its whole mitigation is. This column also holds
replica-backend's security checklist (D041).

## Assets

- Accounts and credentials, and sessions.
- Profile data and photos.
- Messages.
- Area (coarse location) and birthdate.
- Reports and moderation evidence.
- Staff tools.
- Secrets.

## Adversaries

- Anonymous attackers and bots.
- Malicious members: harassers, scammers, scrapers and stalkers.
- Hijacked accounts.
- Minors trying to join.
- Curious or malicious staff.
- A compromised dependency.
- Accidental leaks through logs or the public repo.

## Threats and planned mitigations

| ID | threat | mitigation (planned) | verified by (stage) | status (2026-11-04) |
| --- | --- | --- | --- | --- |
| T01 | Credential stuffing, brute force | Argon2id; per-account and per-IP limits; uniform errors; backoff; common-password blocklist; revoke all sessions on reset | auth tests (6) | **done** for stage 6 scope: Argon2id; NIST policy with a breach blocklist (D042, D043); per-email and per-IP limits; uniform errors with an equal-cost dummy verify; 100-failure lockout; all sessions revoked on reset (F01-N4, F01-N3, LGN-*) |
| T02 | One-time code guessing | 6 digits, 10-minute life, single use, 5 attempts; HMAC at rest; resend cooldown; limits fail closed | auth tests (6) | **done**: 6 digits, 10 min, single use, 5 tries per code, 10 failures/day not reset by a new code, HMAC at rest bound to user and purpose, cooldown, fail closed (F01-N2, REG-C*) |
| T03 | Session theft or replay | opaque token stored as a hash; SecureStore on mobile; HttpOnly, Secure, SameSite=Strict cookies on web; TLS only; short admin sessions; immediate revocation | session tests (6) | partial: opaque 256-bit tokens stored as SHA-256 only; immediate revocation; 30-day sliding expiry (LGN-S*); native keystore and memory-only on web, cache cleared on sign-out (D058). Realtime: single-use 30 s tickets instead of tokens in URLs; sign-out closes the session's connections at once and each connection re-checks its session every 120 s (RT-2, RT-5, RT-6). Admin cookies and short staff sessions (stage 14), TLS at deploy (stage 17) planned |
| T04 | Account enumeration | identical responses and timing for register, resend and reset on known and unknown emails | auth tests (6) | **done** for register, resend and reset: identical status and body, every path hashes or verifies a password, mail sent by the worker; per-email limits independent of existence (F01-E1). Residual: one extra job INSERT on known-account paths (sub-millisecond) |
| T05 | Broken object-level authorization (another user's profile, photo, message or match) | every read goes through `policies/access.py`; 404 rather than 403 for things a user must not know exist | a "second user's data is invisible" test on every route (7-11) | partial: `policies/access.py` for profiles and photos, `visible_match` for matches and messages, staff roles for `/v1/admin` (403); everything else 404 (DSC-A1, MAT-A1, MSG-N1, ADM-N1) |
| T06 | Scraping and harvesting profiles | no search and no public profile pages; random UUIDs; profiles reachable only via the daily set, a match or a like; rate limits; 5-minute signed media URLs | API tests (7-8) | partial: no search or public pages; random IDs; profiles reachable only through today's set; only members with a ready, visible profile can browse; 60 set reads and 120 profile views per hour (DSC-R1); 5-minute signed media URLs |
| T07 | Location inference (trilateration) | area centroids only; distance buckets; one area change per 24 h; coordinates never in responses | tests (8); response-schema check | partial: areas only (no GPS); coordinates and kilometres never in responses, only a bucket (DSC-P1); one area change per 24 hours. Residual: a bucket still narrows location for someone who knows the area list; accepted for the beta |
| T08 | Contact after a block | block, unmatch and send serialise on the match row; enforced on discovery, profile, media, likes, likes received, matches, messages and realtime | one test per path (11) | **done** for the API: the block API closes the match under the match row lock and the pair lock; a block then closes every path both ways, tested one by one (discovery, profile, media, likes, likes received, matches, messages, read, realtime: SAF-B1, mutation-checked), and a send that arrives during a block waits and is refused (SAF-R1; without the send lock it is stored, so the mutation is caught). The app's block button in 11b |
| T09 | Malicious uploads (polyglot files, decompression bombs, metadata leaks such as GPS) | size and pixel limits; decode and re-encode with Pillow; strip metadata; type taken from the decoder; random keys; private bucket | upload tests (7) | **done**: decoder-detected type; 10 MB and 40 MP checked before decoding (a header-only bomb is refused); animation refused; full decode and re-encode; all metadata, GPS included, stripped; random keys; private storage; strict form; 11 MiB request cap (IMG-*, PHO-N1) |
| T10 | Explicit or abusive photos | photos hidden from others until approved; reporting; removal; audit | moderation tests (7, 11) | partial: photos stay hidden until a moderator approves them; the review queue, reporting a photo and removal (rejected) work and are audited (MODR-P1, MODR-R2). **Residual: no automated nudity detection** (D026) |
| T11 | Minors joining | declared-age gate; nothing stored for under-18s; "underage" report reason leading to suspend and purge. **Residual: an age gate is not verification** | tests (6, 11); stated in UI and docs | partial: declared-age gate, IST date, nothing stored or counted for under-18s; label is always "age declared" (F01-N1, REG-A*). Underage reports go to the front of the queue (MODR-Q1); a moderator suspends; purging the account comes with deletion (stage 12). **Residual: an age gate is not verification** |
| T12 | Fake profiles and scams | email verification; rate limits; duplicate photo-hash signal; reports; moderation. **Residual: no liveness check in the MVP** | tests (6-7, 11) | partial: email verification; rate limits; pre-hijacking defeated (D045); reports with evidence and moderation (suspend, ban) work (stage 11). The duplicate photo-hash signal is not used yet. **Residual: no liveness check** |
| T13 | Duplicate or missing matches from races | advisory lock on the user pair; unique pair constraint; `ON CONFLICT DO NOTHING` | concurrency tests (9) | **done**: pair advisory lock plus a unique ordered pair, `ON CONFLICT DO NOTHING`; 50 rounds of simultaneous reciprocal likes give exactly one match each, and a mutation without the lock gives a missed match (MAT-C1). `FOR NO KEY UPDATE` on referenced rows avoids the deadlock the test found (D071) |
| T14 | Duplicate or replayed messages | unique `client_message_id` per sender and match; idempotent POST | tests (10) | **done**: unique (`match_id`, `sender_id`, `client_message_id`); a retry returns the stored message, different text is 409; sends are serialised on the match row, so concurrent double taps store one message and numbers stay gap-free (MSG-C1, mutation-checked: without the lock, sends collide) |
| T15 | Staff misuse | role checks on the server; minimal context in report views; audit log of reads and actions; staff two-factor authentication; separate staff sessions | admin tests (11, 14) | partial: role checks on the server for every `/v1/admin` route, admin-only bans, reinstatement and audit log; no one handles their own case; minimal context; every staff read and action audited; append-only moderation records (ADM-N1, MODR-*). **Release blocker:** separate staff sessions and two-factor authentication (stage 14) before any deployment |
| T16 | Injection (SQL, XSS) | only parameterised ORM queries; text rendered as text (React escapes it); Content-Security-Policy on web | tests and static checks (5+) | partial: only parameterised SQLAlchemy queries; the runtime role cannot run DDL (FND-N6); the app renders all member text as text (React Native has no HTML injection path). CSP for the web console in stage 14 |
| T17 | CSRF on the admin console | SameSite=Strict cookies; Origin check; state changes only through POST, PATCH or DELETE | web tests (14) | planned |
| T18 | Secret leakage | environment variables or a secret manager; `.gitignore`; GitHub secret scanning and push protection (on); no secrets in logs | CI secret scan (5+) | partial: `SecretStr` settings incl. `APP_SECRET_KEY`; `.env` gitignored; CI generates every secret per run (D040); GitHub secret scanning and push protection verified **enabled** |
| T19 | Personal data in logs | structured logs without message bodies, emails, birthdates, tokens or codes; IPs truncated; retention limits | log-format test (5) | partial: allow-list plus scrubbing, tested on stage-5 paths and the whole auth flow (FND-L1, SEC-1); job arguments hold IDs only (D046); message text never logged (MSG-L1); uvicorn's WebSocket handshake lines (full IP, ticket) and DEBUG output filtered, tickets scrubbed (RT-9). Re-tested as each flow lands |
| T20 | Denial of service | request size limits; timeouts; rate limits; WebSocket connections capped per user | tests (5, 10) | partial: 1 MiB body limit; readiness timeouts; auth rate limits (D047). WebSocket caps (stage 10) planned |
| T21 | Supply chain | lockfiles; pip-audit and npm audit in CI; Dependabot (**currently disabled on the repo; enable**) | CI (5) | partial: lockfiles with hashes; pip-audit and `npm audit --audit-level=high` in CI; 7 moderate build-tool advisories accepted (D061). Dependabot alerts and security updates verified **disabled**: owner to enable |
| T22 | Payment replay or forged webhooks (later) | signature verification; event-ID deduplication; server-side entitlements; idempotency keys | payment tests (16) | planned |
| T23 | Notifications leaking content (later) | discreet defaults: no names, no message text | notification tests (16) | planned |
| T24 | Public-repo exposure | no secrets; no competitor screenshots (gitignored); review before every push; visibility decision pending | pre-push checklist | partial: pre-push scan for secrets, binaries and screenshots run before each push so far |
| T25 | Deletion abuse: a stolen phone deletes the account, or a reported member deletes to destroy evidence or come straight back | password re-entry, 5 tries an hour; 7-day restore; reports keep a copy of the reported message; an open report delays the purge (max 30 days); a banned email can't sign up again for a year | privacy tests (12) | **done**: PRIV-D1..D4, PRIV-P2, PRIV-B1 in the API, MOB-11 and E2E-5 in the app; mutation checks (no hold, no barred-email check) caught |
| T26 | Data kept longer than needed | retention rules in one file, applied hourly; append-only records expire through an owner-rights function only | privacy tests (12) | **done** for the API: PRIV-S1 checks each rule at its boundary; the real worker runs the jobs (PRIV-W1). Residual: orphaned files if a deletion job fails 8 times (needs a bucket reconciliation sweep) |

## Residual risks (accepted for MVP; revisit before public launch)

1. **Age and identity are self-declared.** The MVP cannot prove a member is
   18+ or is who their photos show. Options: a liveness vendor, an age-assurance
   provider, or a DigiLocker-style token. All need a DPDP review.
2. **Moderation capacity.** Pre-moderating photos and handling reports needs
   staff time, so the beta size must match moderator hours.
3. **No end-to-end encryption.** Messages are readable by the service, which
   is needed for reports. We disclose this and never claim otherwise.
4. **Legal review.** DPDP, the IT Rules 2021 grievance duties, and the
   app-store dating-app rules need a lawyer's review before launch.
