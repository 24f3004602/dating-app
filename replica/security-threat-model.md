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
| T01 | Credential stuffing, brute force | Argon2id; per-account and per-IP limits; uniform errors; backoff; common-password blocklist; revoke all sessions on reset | auth tests (6) | planned |
| T02 | One-time code guessing | 6 digits, 10-minute life, single use, 5 attempts; HMAC at rest; resend cooldown; limits fail closed | auth tests (6) | planned |
| T03 | Session theft or replay | opaque token stored as a hash; SecureStore on mobile; HttpOnly, Secure, SameSite=Strict cookies on web; TLS only; short admin sessions; immediate revocation | session tests (6) | planned |
| T04 | Account enumeration | identical responses and timing for register, resend and reset on known and unknown emails | auth tests (6) | planned |
| T05 | Broken object-level authorization (another user's profile, photo, message or match) | every read goes through `policies/access.py`; 404 rather than 403 for things a user must not know exist | a "second user's data is invisible" test on every route (7-11) | planned |
| T06 | Scraping and harvesting profiles | no search and no public profile pages; random UUIDs; profiles reachable only via the daily set, a match or a like; rate limits; 5-minute signed media URLs | API tests (7-8) | planned |
| T07 | Location inference (trilateration) | area centroids only; distance buckets; one area change per 24 h; coordinates never in responses | tests (8); response-schema check | planned |
| T08 | Contact after a block | block, unmatch and send serialise on the match row; enforced on discovery, profile, media, likes, likes received, matches, messages and realtime | one test per path (11) | planned |
| T09 | Malicious uploads (polyglot files, decompression bombs, metadata leaks such as GPS) | size and pixel limits; decode and re-encode with Pillow; strip metadata; type taken from the decoder; random keys; private bucket | upload tests (7) | planned |
| T10 | Explicit or abusive photos | photos hidden from others until approved; reporting; removal; audit | moderation tests (7, 11) | planned |
| T11 | Minors joining | declared-age gate; nothing stored for under-18s; "underage" report reason leading to suspend and purge. **Residual: an age gate is not verification** | tests (6, 11); stated in UI and docs | planned |
| T12 | Fake profiles and scams | email verification; rate limits; duplicate photo-hash signal; reports; moderation. **Residual: no liveness check in the MVP** | tests (6-7, 11) | planned |
| T13 | Duplicate or missing matches from races | advisory lock on the user pair; unique pair constraint; `ON CONFLICT DO NOTHING` | concurrency tests (9) | planned |
| T14 | Duplicate or replayed messages | unique `client_message_id` per sender and match; idempotent POST | tests (10) | planned |
| T15 | Staff misuse | role checks on the server; minimal context in report views; audit log of reads and actions; staff two-factor authentication; separate staff sessions | admin tests (11, 14) | partial: `users.role` exists; `audit_log` is append-only for the runtime role (FND-N6). Role checks, staff 2FA and audited reads are planned |
| T16 | Injection (SQL, XSS) | only parameterised ORM queries; text rendered as text (React escapes it); Content-Security-Policy on web | tests and static checks (5+) | partial: only parameterised SQLAlchemy queries so far; the runtime role cannot run DDL (FND-N6). XSS and CSP arrive with the web stage |
| T17 | CSRF on the admin console | SameSite=Strict cookies; Origin check; state changes only through POST, PATCH or DELETE | web tests (14) | planned |
| T18 | Secret leakage | environment variables or a secret manager; `.gitignore`; GitHub secret scanning and push protection (on); no secrets in logs | CI secret scan (5+) | partial: `SecretStr` settings; `.env` gitignored, `.env.example` has placeholders only; CI stores no credentials (D040); GitHub secret scanning and push protection verified **enabled** |
| T19 | Personal data in logs | structured logs without message bodies, emails, birthdates, tokens or codes; IPs truncated; retention limits | log-format test (5) | partial: allow-list plus scrubbing implemented and tested on every stage-5 path (FND-L1, FND-L2, D038). Re-tested as each flow lands (SEC-1) |
| T20 | Denial of service | request size limits; timeouts; rate limits; WebSocket connections capped per user | tests (5, 10) | partial: 1 MiB request body limit, declared or streamed (FND-N4); readiness checks time out. Rate limits (stage 6) and WebSocket caps (stage 10) planned |
| T21 | Supply chain | lockfiles; pip-audit and npm audit in CI; Dependabot (**currently disabled on the repo; enable**) | CI (5) | partial: `uv.lock` with hashes; pip-audit in CI (clean on 2026-11-04). Dependabot alerts and security updates verified **disabled**: owner to enable |
| T22 | Payment replay or forged webhooks (later) | signature verification; event-ID deduplication; server-side entitlements; idempotency keys | payment tests (16) | planned |
| T23 | Notifications leaking content (later) | discreet defaults: no names, no message text | notification tests (16) | planned |
| T24 | Public-repo exposure | no secrets; no competitor screenshots (gitignored); review before every push; visibility decision pending | pre-push checklist | partial: pre-push scan for secrets, binaries and screenshots run before each push so far |

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
