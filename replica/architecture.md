# Architecture: working title Haanji (an original dating app)

Status: **agreed** by the owner on 2026-11-04 (D020-D029 active). Date:
2026-11-04. Inputs: `recon.md`, `features.csv`, `fixes.md`. Method:
replica-architect, using the stack the owner specified rather than Replica's
defaults (Supabase, Drizzle, Vercel).

## Shape: a modular monolith

One API service, one worker process from the same codebase, one PostgreSQL
database, Redis for ephemeral data, and private object storage. Two clients:
the Expo app for members and Next.js for the landing page and admin console.
There are no microservices. Modules call each other through service
functions, never over HTTP.

```
 Expo app (iOS/Android/web)          Next.js (landing + /admin)
        |  HTTPS + WSS                       |  HTTPS (server-side calls)
        v                                    v
 +--------------------- API: FastAPI (uvicorn) ---------------------+
 | auth | accounts | profiles | media | discovery | matching        |
 | messaging | safety | moderation | privacy | admin | realtime      |
 |            policies/access.py: one source of visibility rules     |
 +--------+------------------+------------------+--------------------+
          | SQL              | pub/sub, limits  | S3 API
          v                  v                  v
     PostgreSQL 17         Redis 7        object storage (private)
          ^
          | job table (Postgres)
     worker (same code): emails, purges, retention sweeps
          |
          +--> provider adapters: email (MVP) | SMS, push, verification, payments (later)
```

## Stack

All versions were verified on the npm and PyPI registries on 2026-11-04.
Exact versions are pinned in lockfiles when each part is created.

| layer | choice | why |
| --- | --- | --- |
| API | Python 3.13, FastAPI 0.162, Pydantic 2.14, pydantic-settings 2.16, uvicorn 0.54 | owner spec; typed validation; OpenAPI generated from code |
| ORM / DB access | SQLAlchemy 2.1 (async) with psycopg 3.3, one driver for app and migrations | owner spec; psycopg supports both sync (Alembic) and async |
| migrations | Alembic 1.20 | owner spec; reviewed, versioned DDL |
| database | PostgreSQL 17 (D033) | owner spec; installed locally and in CI. **No PostGIS**: location uses known area centroids (D020), a privacy choice |
| cache / realtime fan-out / rate limits | Redis 7, redis-py 8.1 | justified by WebSocket fan-out across workers and rate-limit counters; never the source of truth |
| background jobs | procrastinate 3.10 (PostgreSQL-backed) | jobs are enqueued in the same transaction as the data change; no extra broker. Verified on Python 3.13 with PostgreSQL 17 (D035); added in stage 6 |
| passwords | argon2-cffi 25.1 (Argon2id) | memory-hard; current best practice |
| images | Pillow 13 | decode, check, strip metadata, re-encode |
| uploads | python-multipart 0.0.33 | FastAPI form uploads |
| API tests | pytest 9.2, pytest-asyncio 1.4, httpx 0.28 against a real PostgreSQL | tests constraints and transactions for real |
| quality | ruff 0.17, mypy 2.4, pip-audit 2.10 | lint, types, dependency vulnerabilities |
| mobile | Expo SDK 58 (React Native 0.88.1, React 19.3.0; Node ≥ 22.13), Expo Router 58, TanStack Query 5.105, React Hook Form 7.91, Zod 4.6, openapi-fetch 0.17, expo-secure-store, expo-image-picker; TypeScript 6.0 (Expo's pin) (D057) | owner spec; SDK 58 requirements checked in Expo's docs (iOS 16.4+, Android 7+) |
| web | Next.js 16.4 (App Router), React 19, TypeScript | owner spec; landing page and admin console |
| shared types | openapi-typescript 7.13 (with its own TypeScript 5.9) in `packages/api-types`, generated from `scripts/export_openapi.py`; CI fails if they drift | one contract; no hand-written duplicate types |
| JS workspace | npm workspaces (`apps/mobile`, `apps/web`, `packages/api-types`) | hoisted layout is the safest for Metro. To verify against Expo's monorepo guide in stage 7 |
| e2e tests | Playwright 1.64 with the installed Chrome, axe-core 4.14 scans, against the Expo web build and a real API (D062) | Playwright not yet installed on the owner's laptop (Chrome 156 and Edge 156 are); install when the first web or e2e stage starts |
| CI | GitHub Actions, with PostgreSQL and Redis as service containers | workflow `.github/workflows/api.yml` (D040). Docker Desktop is installed locally but its daemon is off, so container builds are verified in CI |
| hosting (later) | not chosen. Constraints: India region (Mumbai) for data and latency; managed PostgreSQL and Redis; S3-compatible storage | nothing is deployed without owner authorization |

Compatibility risk found: the latest TypeScript is 7.0.2, but
openapi-typescript 7.13 declares a TS ^5 peer. Each app pins the TypeScript
version its framework template uses, and generation is checked in CI.

## Repository layout

```
apps/api/            FastAPI service + worker (uv project, pyproject.toml, uv.lock)
  app/main.py        app factory, routers, middleware, error handlers
  app/config.py      settings from environment (never secrets in code)
  app/db.py          engine, session, transaction helpers
  app/modules/<m>/   router.py, schemas.py, service.py, models.py per module
  app/policies/      access.py: who may see or contact whom (single source)
  app/providers/     email, sms, storage, verification, payments adapters + fakes
  migrations/        Alembic
  tests/             unit/, api/, concurrency/
apps/mobile/         Expo SDK 58 app (expo-router)
apps/web/            Next.js 16: / (landing), /admin (moderation console)
packages/api-types/  generated TypeScript types
infra/               Dockerfiles and compose for CI and deploys (not runnable here)
.github/workflows/   CI
replica/             project documents
```

## Data model

All tables use UUID primary keys, generated randomly so IDs cannot be
enumerated. Times are `timestamptz` stored in UTC. "Today" means the
`Asia/Kolkata` date, which is configurable.

**Access rules:** one authorization check per query, in the service layer,
through `policies/access.py`. Row-level security is not used because the app
connects as a single database role. The app role has no DDL rights, and
migrations run as a separate role.

| table | key columns and constraints | added in stage |
| --- | --- | --- |
| `users` | `email_normalized` unique; `password_hash`; `birthdate`; `status` (pending, active, suspended, banned, deactivated); `role` (member, moderator, admin); `email_verified_at`; `last_active_at`; `deletion_requested_at` | 5 |
| `consents` | `user_id`; `kind` (terms, privacy); `version`; `granted_at`; `withdrawn_at` (DPDP consent record) | 6 |
| `sessions` | `token_hash` unique (SHA-256 of an opaque token); `user_id`; `client` (mobile, web_admin); `expires_at`; `revoked_at`; `last_used_at` | 5 |
| `one_time_codes` | `user_id`; `purpose` (verify_email, reset_password); `code_hash` (keyed HMAC); `expires_at`; `consumed_at`; `attempts`; one live code per user and purpose (partial unique index) | 5 |
| `audit_log` | append-only: actor, action, target type and id, `metadata` jsonb without personal data, `created_at` | 5 |
| `areas` | slug `id`; city, area name, approximate public centroid latitude and longitude, active. Seeded by migration, read-only for the app (D051) | 7 |
| `profiles` | `user_id` primary key; `display_name` (1-40); `gender`; `interested_in` (array); `intent` (required); `bio` (≤ 500); `area_id`; `area_changed_at`; `visibility`; `discovery_paused` (vocabularies: D050) | 7 |
| `profile_prompts` | `user_id`, `prompt_key` (our own prompt catalogue), `answer` (≤ 200), `position`; unique (`user_id`, `position`) | 7 |
| `photos` | `user_id`; `position` 0-5, unique per user (deferrable, for reorders); random `storage_key`; dimensions; `sha256` of the original; `moderation_state` (pending, approved, rejected); `reviewed_at` | 7 |
| `preferences` | `user_id` primary key; age min and max (18-99, min ≤ max); `max_distance_km` (5, 15, 50 or any). Genders come from `profiles.interested_in` (D066) | 8 |
| `daily_picks` | (`viewer_id`, `pick_date`, `candidate_id`) primary key; `rank`. Kept 7 days | 8 |
| `interactions` | `actor_id`, `target_id`, `kind` (like, pass), optional `comment` (≤ 150) and target item; **unique (`actor_id`, `target_id`)**; check actor ≠ target. Table from stage 8 (D064), API in 9 | 8 (API 9) |
| `matches` | `user_a_id` < `user_b_id` (check); **unique (`user_a_id`, `user_b_id`)**; `closed_at`, `closed_reason` (unmatched, blocked, deleted, moderation), set together (check). Interactions gained `target_photo_id` and `target_prompt_key` | 9 |
| `messages` | `match_id`, `sender_id`, `n` (sequence number per match, **unique (`match_id`, `n`)**), `body` (1-2000), `client_message_id`; **unique (`match_id`, `sender_id`, `client_message_id`)**; `flag` (hurtful, money; D075). Matches gained `last_message_n`, `last_message_at`, `last_sender_id`, written under the match row lock (D072). `removed_at` arrives with moderation (11) | 10 |
| `match_reads` | (`match_id`, `user_id`) primary key; `last_read_n`, only moves forward; never shown to the other person | 10 |
| `blocks` | (`blocker_id`, `blocked_id`) primary key; check blocker ≠ blocked. Table from stage 8 (D064), API in 11 | 8 (API 11) |
| `reports` | reporter, subject user, optional message or photo (SET NULL: reports outlive accounts); `evidence_text` (a copy of the reported message, D080); `reason` (fake, harassment, explicit, scam, underage, hate, other); `details` (≤ 1000); `status` (open, in_review, actioned, dismissed); `priority` 1-3; assignee; `resolved_at`, `resolved_by`; index (status, priority, created_at) | 11 |
| `moderation_actions` | append-only for the app (SELECT, INSERT), no foreign keys: moderator, target user, report, photo, message, `action` (dismiss, warn, remove_photo, remove_message, suspend, ban, reinstate, approve_photo, reject_photo), `note` (≤ 500). Messages gained `removed_at` | 11 |

Foreign keys declare their `on delete` rule explicitly. Safety records
(reports, moderation actions) are kept on purpose; see
`privacy-data-inventory.md`. Every foreign key, and every column used for
filtering or sorting, is indexed.

## API conventions

| topic | rule |
| --- | --- |
| path and versioning | `/v1/...`; breaking changes go to `/v2` |
| format | JSON with snake_case fields; RFC 3339 UTC timestamps; UUID strings |
| validation | Pydantic models with `extra="forbid"`, explicit lengths, enums and ranges; emails normalised |
| errors | RFC 9457 problem details (`application/problem+json`) with a stable `code`; validation errors list their fields; no stack traces or internal details |
| auth | `Authorization: Bearer <opaque session token>` for mobile. The admin console uses an HttpOnly, Secure, `SameSite=Strict` cookie, and Next.js forwards the token server-side |
| pagination | cursor-based: `?cursor=&limit=` (max 50), returning `{items, next_cursor}` |
| idempotency | messages carry a `client_message_id`; likes and passes are unique per pair, so a retry returns the original result; payments (later) take an `Idempotency-Key` |
| rate limits | 429 responses with `Retry-After`; limits are set per route group and per account and IP |
| privacy of responses | never return coordinates, exact distances, emails or birthdates of other users; age is returned in years |
| docs | OpenAPI at `/v1/openapi.json`; interactive docs only outside production |
| health | `/healthz` (process alive) and `/readyz` (database and Redis reachable) |

## API by flow (MVP)

Who: **P** public, **M** signed-in member, **Mod** moderator, **Adm** admin.

| method and path | does | who | flow |
| --- | --- | --- | --- |
| POST /v1/auth/register | email, password, birthdate (rejected if under 18; nothing stored), consents; sends a code | P | F01 |
| POST /v1/auth/verify-email | email, code **and the sign-up password** (D045); opens a session | P | F01 |
| POST /v1/auth/resend-code | same response whether or not the account exists | P | F01 |
| POST /v1/auth/login, /logout, /logout-all | session lifecycle | P / M | F01 |
| POST /v1/auth/password-reset/request, /confirm | email code; on confirm, every session is revoked | P | F01 |
| GET /v1/me; POST /v1/me/deletion | account summary with verification labels (stage 6); delete my account with the password: hidden and signed out now, purged after 7 days (stage 12, D083) | M | F01, F09 |
| POST /v1/auth/restore | sign in and keep an account that is waiting to be deleted (otherwise the same as sign-in) | P | F09 |
| GET, PUT /v1/me/profile; GET /v1/areas; GET /v1/prompts | edit own profile (stage 7); areas and prompts, never coordinates | M | F02 |
| GET, PUT /v1/me/preferences | discovery preferences (stage 8) | M | F03 |
| POST /v1/me/photos; PATCH /v1/me/photos/order; DELETE /v1/me/photos/{id} | upload (multipart), reorder, delete | M | F02 |
| PATCH /v1/me/privacy | visibility (`everyone`, `liked_only`) and discovery pause; stored from stage 7, applied to discovery in stage 8 | M | F07 |
| GET /v1/profiles/{user_id} | only if `access.can_view_profile` (in today's set, matched, or liked you); otherwise 404 | M | F03 |
| GET /v1/media/{photo_id} | authorised redirect to a short-lived signed URL; in development the URL is the API's own signed `/v1/media/blob/...` route (D053) | M | F03, F05 |
| GET /v1/discovery/today | today's finite set; generated once per viewer per day | M | F03 |
| POST /v1/interactions | like or pass, optional comment; enforces eligibility, the daily like limit and the your-turn cap; returns the match if one is created | M | F03, F04 |
| GET /v1/likes/received | people who liked you | M | F04 |
| GET /v1/matches; GET /v1/matches/{id}; POST /v1/matches/{id}/unmatch | matches by latest activity, with the last message, unread count and `your_turn` (stage 10); one match; unmatch (stage 11) | M | F04, F06 |
| GET, POST /v1/matches/{id}/messages; POST /v1/matches/{id}/read | history by sequence number (`before`, `after`), idempotent send (201, or 200 for a retry), read pointer (D072) | M | F05 |
| POST /v1/realtime/ticket; WS /v1/realtime | single-use 30-second ticket, so the session token never appears in URLs; events: `ready`, `message.created`, `match.created`, `read.updated`, `resync`, `ping` (match.closed in stage 11); close codes 4401, 4429, 1012 (D074) | M | F05 |
| POST /v1/blocks; GET /v1/blocks; DELETE /v1/blocks/{user_id} | block, list blocks, unblock (a match is not restored) | M | F06 |
| POST /v1/reports; GET /v1/reports/mine | report a profile, message or photo (blocks by default); see report status | M | F06 |
| GET /v1/safety/nudge-terms | the `hurtful` and `money` word lists (D075) | M | F05 |
| GET /v1/admin/reports; GET /v1/admin/reports/{id}; POST /v1/admin/reports/{id}/actions | moderation queue; minimal context; every read and action is audited | Mod | admin |
| GET /v1/admin/photos/pending; POST /v1/admin/photos/{id}/decision | photo review | Mod | admin |
| POST /v1/admin/users/{id}/actions (suspend: Mod; ban, reinstate: Adm); GET /v1/admin/audit-log (Adm) | account actions with a required note; audit trail (D081) | Mod / Adm | admin |

**Webhooks in:** none in the MVP. Payments later need signed Razorpay
webhooks and store server notifications. **Webhooks out:** none.

**Jobs:**

| job | when | does |
| --- | --- | --- |
| `auth:issue_code` | on demand | generates a code (only its HMAC is stored) and emails it; arguments are a user ID and a purpose only (D046) |
| `auth:send_notice` | on demand | security notices (sign-up attempt on a taken address, password changed, password sign-in paused) |
| `media:delete_objects` | on demand | deletes photo files after their rows are gone (photo delete, account purge) |
| `privacy:purge_accounts` | hourly at :07 | purges accounts past the grace period (or 90 days after a ban), unless held by an open report, at most 30 days (D083) |
| `privacy:retention_sweep` | hourly at :37 | the privacy inventory's retention rules: ended conversations, old picks, sessions, codes, unverified sign-ups, report links and reports, deleted-account records, expired audit records (D084, D085) |
| `privacy:remove_old_jobs` | daily 21:15 UTC | finished, failed, cancelled and aborted job rows after 30 days |

## Key mechanisms

- **Sessions:** an opaque 256-bit random token is stored only as a SHA-256 hash.
  - Mobile sessions last 30 days, sliding (refreshed at most every 15 minutes); admin sessions (stage 14) last 12 hours with a 30-minute idle timeout.
  - All sessions are revoked on logout-all, password reset, ban or deletion.
  - JWTs were rejected because revocation must take effect immediately.
- **One-time codes:**
  - 6 digits, valid 10 minutes, single use, at most 5 attempts per code, and at most 10 failures a day per account and purpose; a new code does not reset that count (NIST SP 800-63B-4).
  - Stored as an HMAC (bound to user and purpose) under a key derived from `APP_SECRET_KEY`. The plaintext exists only in the worker and the email.
  - 60-second resend cooldown and a daily cap, plus per-IP limits, in Redis under HMAC'd keys (D047).
  - Auth limits fail closed (503) if Redis is down.
- **Passwords:**
  - Argon2id.
  - NIST SP 800-63B-4 (D042): 15-128 characters counted in code points after NFC; no composition rules; the whole password is checked against a 15,841-entry breach blocklist (D043), context words (service name, email) and trivial repetition. Spaces are kept.
  - Login errors are uniform (unknown email and wrong password look the same, with an equal-cost dummy verify), with per-email and per-IP limits; 100 consecutive failures pause password sign-in until a reset.
  - Hashes are upgraded on login when the Argon2 parameters change.
- **Age gate:**
  - Date of birth is compared with today in IST.
  - Under-18 sign-ups are rejected and none of their data is stored.
  - The label shown is "age declared"; this is **not** age verification (D016).
- **Location (D020):**
  - The member picks an area from a seeded list (Delhi NCR first). The app does not use GPS in the MVP.
  - Distance between members is computed between area centroids and shown as a bucket (< 5, 5-15, 15-50, 50+ km).
  - Area changes are limited to one per 24 hours, to block trilateration by moving around.
  - Coordinates never leave the server.
- **Discovery (D014):**
  - `discovery/today` builds a set of about 15 profiles once a day and stores it in `daily_picks`.
  - SQL filters run first: active, adult, visible, not paused, at least 2 approved photos, reciprocal gender, age and distance preferences, compatible intent, no block in either direction, no prior interaction, not already matched.
  - A deterministic score follows (intent match, shared prompts or interests, activity bucket, completeness). Ties break by a stable hash of (viewer, candidate, date). No machine learning.
- **Atomic matching:**
  - In one transaction: take `pg_advisory_xact_lock` on the ordered user pair, re-check eligibility, insert the like (unique per pair), check for the reciprocal like, then `INSERT ... ON CONFLICT DO NOTHING` into `matches`.
  - The lock serialises two people liking each other at the same moment, so that race cannot end with no match; the unique constraint makes duplicate matches impossible. Concurrency tests prove both (stage 9).
- **Messaging:**
  - REST is the source of truth; the WebSocket only delivers hints.
  - Sending locks the match row (`FOR SHARE`) and checks that it is open, that the sender is a participant, that neither user has blocked the other, and that both accounts are active.
  - Blocking and unmatching update the same row, so a message cannot slip through after a block.
  - Redis pub/sub on a per-user channel fans out across workers. On reconnect the client catches up through REST cursors.
  - There is no end-to-end encryption, and the app must not claim any.
- **Blocks:** enforced by `policies/access.py` on every path: discovery, profile, media, likes, likes received, matches, messages and realtime. Each path has its own test.
- **Media:**
  - Upload limits: 10 MB, 40 megapixels; JPEG, PNG or WebP; single-frame images only.
  - Pillow decodes each upload, which rejects polyglots and decompression bombs.
  - GPS and other metadata are stripped. Images are re-encoded at 1080 px and 400 px under random keys in a private bucket.
  - Photos are visible to others only after approval. `PHOTO_REVIEW_REQUIRED` defaults to on.
  - Delivery uses signed URLs that expire in 5 minutes.
- **Admin protection:**
  - Every `/v1/admin/*` route requires a role on the server.
  - Next.js middleware only improves the experience; the API is the authority.
  - Staff sessions are separate, and staff two-factor authentication (TOTP, pyotp) is planned for stage 14.
- **Logging:**
  - Structured JSON with request IDs and user IDs.
  - Never logged: message bodies, emails, birthdates, tokens or codes. IP addresses are truncated.
  - Security logs are kept for at least 1 year (DPDP), then deleted.

## Integration strategy

Every external service sits behind an interface with a development fake. The
real adapter is switched on by configuration once the owner has set up the
account.

| interface | development and tests | production candidates (to evaluate) | when |
| --- | --- | --- | --- |
| `EmailSender` | console and in-memory outbox | Amazon SES (Mumbai), Postmark, Resend | stage 6 |
| `SmsSender` | console | an Indian SMS provider. Needs DLT entity and template registration | after the MVP |
| `ObjectStorage` | local filesystem in `var/` | S3 (ap-south-1) or Cloudflare R2 | stage 7 |
| `VerificationProvider` | none ("not verified" labels) | a liveness vendor, after DPDP review of biometric data | after the MVP |
| `PushSender` | none | Expo push, APNs, FCM | stage 16 |
| `PaymentProvider` | sandbox fake | Razorpay (web); App Store and Google Play billing (mobile) | stage 16, after rules are verified |

## The parts that bite

- **Time zones:** daily sets and like limits use the IST date. Storage is UTC.
- **Idempotency:**
  - messages: `client_message_id`
  - likes and passes: unique per pair
  - webhooks (later): verify the signature and record the event ID before acting
- **Races:**
  - reciprocal likes: advisory lock plus unique constraint
  - block against send: shared lock on the match row
  - photo reorder: deferrable unique constraint
- **Rate limits:** auth, codes, likes, messages, discovery, profile views, uploads and area changes. Counters live in Redis; the business limit on likes is counted in PostgreSQL.
- **Scraping:**
  - no search, no public profiles, random IDs
  - profiles are reachable only through the daily set, a match or a like
  - signed media URLs expire quickly
- **Realtime:** 25-second heartbeats; reconnect with backoff; a connection cap per user; REST catch-up.
- **Deletion (DPDP, D083):**
  - Requesting deletion (with the password) immediately hides the account, revokes its sessions, closes its realtime connections and ends its matches.
  - Signing in within 7 days can keep it; after that the purge deletes the user row and the database cascades, while photo files go through a queued job in the same transaction.
  - An open report delays the purge (at most 30 days); reports, moderation records and the audit trail are kept under listed exceptions, without the link where the inventory says so.
  - Backups expire on a schedule, and erasure from backups happens when they expire. We say exactly that, no more.
- **Email deliverability:** SPF, DKIM and DMARC on the sending domain are owner setup.
- **Offline:** the mobile app shows an offline state and retries idempotent requests.

## Build order (owner stages 5-17)

1. **Stage 5 (foundation):**
   - API app factory, settings, DB session, error format, `/healthz` and `/readyz`, OpenAPI.
   - Alembic baseline: `users`, `sessions`, `one_time_codes`, `audit_log`.
   - pytest harness on a real PostgreSQL; CI workflow; dev seed command (labelled fixtures only).
2. **Stage 6 (auth):** flows F01 with `consents`, rate limits, `EmailSender`, an `SmsSender` interface and tests.
3. **Stage 7 (profiles):** profiles, prompts, areas, photos and the media pipeline, then the Expo scaffold with auth and profile screens. This is the first vertical slice.
4. **Stage 8 (discovery):** preferences, `daily_picks`, eligibility filters and ranking.
5. **Stage 9 (matching):** interactions and matches, with concurrency tests.
6. **Stage 10 (messaging):** messages, realtime, unread counts, nudge terms.
7. **Stage 11 (safety):** blocks, reports, the moderation queue and audit trail.
8. **Stage 12 (privacy):** privacy preferences, pause, the deletion workflow and retention jobs.
9. **Stage 13 (mobile polish):** design system and flow integration on the mobile app.
10. **Stage 14 (web):** the Next.js landing page and admin console, with staff 2FA.
11. **Stage 15 (audit):** check against `features.csv`; full test runs.
12. **Stage 16 (optional, gated):** notifications and the single paid plan.
13. **Stage 17:** release readiness and a staging plan, with no public deploy.

Each stage ends with its tests, `features.csv` status, `test-plan.md` results
and `progress.md` updated.

## Riskiest parts

1. **Proving the safety rules on every path:** blocks, authorization and
   location privacy.
2. **Matching and messaging under concurrency.**
3. **Honest trust signals without liveness or ID verification in the MVP:**
   fakes and minors stay a residual risk; see the threat model.
