# Privacy data inventory

Date: 2026-11-05. Status: **implemented for the API** (stage 12a): every row
below is real, and the retention rules and account deletion run as jobs
(`app/modules/privacy/`, D083-D085). Nothing is collected from real people
yet (no deployment, no real mail provider). Regulatory frame: India's DPDP Act
and Rules; core obligations apply from 2027-05-13 [recon 22]. This is not legal
advice: periods marked **(R)** need a lawyer's confirmation before launch.

Principles:
- Collect the minimum.
- No precise location.
- No contact lists, ID documents or biometrics in the MVP.
- Consent is recorded with versions.
- Deletion is real, and every exception is listed below.

The periods live in one file, `app/modules/privacy/retention.py`; change it and
this table together.

| data | purpose | source | stored in | who can see it | retention | when the account is deleted |
| --- | --- | --- | --- | --- | --- | --- |
| email | login, codes, service notices | member | `users` | the member; staff when handling a case (not shown in the moderation views so far) | while the account exists; an unverified sign-up is deleted after 7 days | deleted. For a **banned** account only, a keyed hash (HMAC-SHA256) is kept 1 year **(R)** so the address can't sign up again at once (`deleted_accounts.email_digest`) |
| password | authentication | member | `users`, as an Argon2id hash only | nobody | while the account exists | deleted |
| birthdate | age gate (18+); show age | member | `users` | others see age in years only; staff see age | while the account exists | deleted. Under-18 attempts are never stored |
| display name, gender, interested in, intent, bio, prompt answers | matching and display | member | `profiles`, `profile_prompts` | eligible members (daily set, matches, people who liked them); staff for reports | while the account exists | deleted |
| area (coarse; one change per 24 h) | distance buckets, discovery | member choice from a list | `profiles.area_id` | others see the area name and a distance bucket, never coordinates | while the account exists | deleted |
| photos and derived sizes, plus an image hash (only two re-encoded JPEGs with no metadata are kept; the upload is discarded) | display; abuse signal (planned) | member | private object storage (development: local disk under `var/media`); `photos` | eligible members via signed URLs; staff | until the member deletes the photo; a photo a moderator rejected stays visible only to its owner until they delete it | rows deleted in the purge transaction; the files by a queued job in the same transaction, retried 8 times. No photo hash is kept (the duplicate-photo signal isn't built) |
| likes, passes, like comments and what a like was about | matching | member actions | `interactions` | the target sees likes and comments; passes are private | while both accounts exist | deleted, both directions |
| matches | chat access | system | `matches` | both participants | open: while both accounts exist; **ended (unmatch, block, ban, deletion): 30 days, then deleted with the conversation** | deleted |
| messages | communication | members | `messages`, as plain text in PostgreSQL (no end-to-end encryption, and the app says so); a `flag` from the nudge lists. Never in logs, never in Redis (hints carry IDs only). The app holds them in memory only, cleared on sign-out | the two participants; staff only for reported messages, as the copy in the report | hidden at once when a match ends; **deleted 30 days after it ends** | deleted with the match (the other person's messages too: the conversation is gone). A report keeps its own copy of the reported message |
| read pointers | unread counts | system | `match_reads`, and `last_message_*` on matches | the member only (no read receipts, D072) | the life of the match | deleted |
| realtime tickets and connection slots | live updates | system | Redis: ticket digests (SHA-256) with the user and session ID; connection IDs per user ID | nobody | 30 s (tickets, single use); 75 s after the last heartbeat (slots) | expire; the deletion request closes every connection at once |
| blocks | safety | member | `blocks` | the blocker only | while both accounts exist | deleted, both directions |
| reports (reason, details, the reported item and a copy of a reported message) | safety | member | `reports` | the reporter (status only, never the action); staff (the reporter only as an ID) | **the reporter's ID is removed 90 days after resolution, and the report deleted 2 years after resolution (R)**; open reports stay until resolved | kept under the safety exception, without the link to the deleted person (SET NULL). An open report about an account delays its purge, at most 30 days |
| moderation actions, audit log (actor and target IDs, action, request ID; details hold codes and counts only) | accountability | staff, system | `moderation_actions`, `audit_log` | admins | 3 years **(R)**, removed by `app_purge_expired_records()`: the app can't delete anything younger | kept under the exception (IDs only) |
| consent records (kind, document version, time) | proof of notice and consent (DPDP) | member | `consents` | the member; admins | the life of the account, then 1 year **(R)** | copied into `deleted_accounts.consents` (with the user ID and dates), kept 1 year, then deleted |
| deleted-account record (user ID, request and deletion times, banned or not, consents, banned email hash) | proof of consent; stopping banned re-registration | system | `deleted_accounts` | admins | 1 year **(R)** | this row *is* what remains |
| session token on the device | staying signed in | system | native keystore; memory only on web (D058) | the member's device | until sign-out or expiry | cleared at sign-out; the server revokes every session at the deletion request |
| sessions (SHA-256 of the token, client type, timestamps, the first user-agent product token only) | authentication | system | `sessions` | the member (device list, later) | 30 days after expiry or revocation | revoked at the request, deleted in the purge |
| staff second factor (stage 14): the TOTP secret, encrypted with AES-256-GCM; the last time step used; recovery codes as HMACs; enrolment tokens as SHA-256 | staff sign-in (D090) | system | `staff_mfa`, `staff_recovery_codes`, `staff_enrollments` | nobody (the staff member sees the secret and recovery codes once) | while the staff account exists; enrolment tokens 30 days after use or expiry | deleted with the account |
| subscriptions (stage 16b, sandbox) | the plan: who has it and until when | the payment provider's webhooks | `subscriptions` (provider subscription ID, status, paid until); `payment_events` (event IDs, 90 days). No amounts, cards, UPI IDs or invoices | the member (status); admins | while the account exists; event IDs 90 days | deleted; a live subscription is cancelled at the provider at the deletion request |
| push tokens and platform (stage 16) | sending discreet pushes to the member's phone | the member's phone, when they turn notifications on | `push_devices`, one per session | nobody (Expo, Apple and Google see the token to deliver) | while the session lives; removed at sign-out or when Expo reports the token dead | deleted with the session and the account |
| notification preferences (stage 16) | which kinds to push | member | `notification_prefs` | the member | while the account exists | deleted |
| notices from the team (stage 16) | telling a member about a warning | staff action | `member_notices` (kind, time, read) | the member | while the account exists | deleted |
| push tickets (stage 16) | checking delivery and dropping dead tokens | system | `push_tickets` (receipt ID, token) | nobody | until checked, at most 24 hours | expire |
| staff console cookies (stage 14b) | keeping a staff member signed in to the console | system | the staff member's browser: `__Host-staff` (the session token) and `__Host-staff-step` (the sign-in challenge), HttpOnly, Secure, SameSite=Strict | nobody else; page scripts can't read them | until the session ends (12 hours at most) or sign-out; the challenge 5 minutes | cleared at sign-out; the API revokes the session |
| staff sign-in challenges | the step between password and code | system | Redis: SHA-256 of the challenge, the user ID, the attempt count, a pending secret (encrypted) | nobody | 5 minutes, or until used | expire |
| beta invite list (stage 18, D096) | invite-only sign-up | the owner, from the testers' addresses | `signup_invites`: an HMAC-SHA256 of the normalised email and its expiry, never the address | nobody (it can be checked, not read) | until the email is verified, or 30 days | already gone once the email is verified |
| one-time codes | verification | system | `one_time_codes` (HMAC only, plus attempts); the plaintext exists only in worker memory and the email | nobody | 1 day after expiry | deleted |
| daily picks (candidate, rank, distance bucket) | discovery | system | `daily_picks` | the viewer | 7 days | the account leaves everyone's sets at the request; deleted |
| discovery preferences (age range, distance bucket) | discovery | member | `preferences` | the member | while the account exists | deleted |
| rate-limit counters | abuse prevention | system | Redis, keyed by an HMAC of the email, IP or user ID (no plain values) | nobody | 1 minute to 24 hours (TTL) | expire |
| job queue rows | sending codes and notices; deleting files; the privacy jobs | system | `procrastinate_jobs` and `procrastinate_events` (user ID or object keys, purpose or notice kind; never an email or a code) | engineers | succeeded jobs deleted at once; failed, cancelled or aborted jobs 30 days after they end (`privacy:remove_old_jobs`) | a failed job naming the user ID lasts at most 30 days |
| security logs (truncated IP, route template, method, status, duration, request ID, user ID) | security, breach detection | system | log store (stdout in development; to choose at deployment) | restricted engineers | 1 year (DPDP minimum for such logs), then deleted by the log store's retention setting (deployment, stage 17) | kept under the exception, then deleted |
| backups | disaster recovery | system | beta (D096): `backup.sh`, daily, the database and photos on the server's own disk, 7 days; launch: provider backups | restricted engineers | 30-day rolling **(R)** | deleted data disappears when the backups age out; members are told so |

## Account deletion (D083)

1. **Request** (`POST /v1/me/deletion`, with the password; 5 tries an hour):
   the account is hidden everywhere at once, every session is revoked, its
   realtime connections close (4401), open matches end and the other person's
   chat closes live, and it leaves everyone's daily set.
2. **Grace period, 7 days.** Signing in shows the date and offers to keep the
   account (`POST /v1/auth/restore`); a password reset still works. Ended
   matches stay ended. While the account is the subject of an open report the
   purge waits, at most 30 more days, so deleting can't erase evidence before
   moderators look.
3. **Purge** (hourly, one transaction per account): the record in
   `deleted_accounts` is written, the photo files are queued for deletion,
   and the user row is deleted; the database cascades to everything else.
   Banned accounts are purged the same way 90 days after the ban **(R)**,
   unless reinstated.

What deletion does **not** reach, and the app and privacy notice must say so:
- **Backups:** deleted data stays in backups until they age out (30 days, once backups exist).
- **Emails already delivered** sit in the member's mailbox. The email provider's own logs follow its retention, which we can't erase (provider not chosen).
- **Security logs** keep the user ID for up to 1 year.
- **Kept on purpose:** reports, moderation actions and the audit trail, under the exceptions above.
- **Other people's devices:** a match's app may still show a conversation already on screen until it refreshes. The chat closes live, but we can't wipe another phone.

Suspended or banned members can't sign in, so they can't use the request
flow: until a support tool exists (stage 14 console), erasure requests from
them go through the grievance contact.

## Store review (stage 12, 2026-11-05)

| store | what's there | how it's cleaned | verified by |
| --- | --- | --- | --- |
| PostgreSQL, app tables | every row above | cascades on user deletion; the hourly sweep | PRIV-* tests: each table checked empty for the purged account; each sweep rule at its boundary |
| PostgreSQL, job tables | IDs, object keys, kinds | succeeded jobs deleted at once; the rest after 30 days | the real worker runs all three privacy jobs; the old-jobs task calls procrastinate's own clean-up |
| object storage | two JPEGs per photo, under random keys | deleted by `media:delete_objects` after the row is gone (photo delete or purge) | PRIV-P1 (memory storage), PRIV-W1 (the real worker) |
| Redis | rate-limit counters (HMAC'd keys), realtime tickets and slots, pub/sub hints (IDs only) | TTLs; nothing personal to delete | by design; RT-* tests |
| logs | request lines with the user ID; no bodies, emails, tokens, codes or message text | the log store's retention (to set at deployment) | FND-L1, SEC-1, MSG-L1, RT-9 |
| email provider | messages sent (codes, notices) | the provider's retention; can't be recalled | not connected yet |
| devices | session token; data in memory | cleared at sign-out and after a deletion request (the query cache too); the app signs out when the server ends its session | MOB-11 (keystore cleared), E2E-5 |

Residual gaps:
- A photo file whose deletion job fails 8 times is left in storage with no row pointing to it. Its job stays visible for 30 days. A reconciliation sweep that lists the bucket comes with the bucket adapter (owner setup).
- The duplicate-photo signal isn't built, so no photo hash outlives its photo.

## External processors (none connected yet)

| processor type | data shared | status |
| --- | --- | --- |
| email delivery | email address, code or notice text | **beta: Gmail over SMTP** (a dedicated account, owner's choice, D096); the adapter works with any SMTP provider. Gmail keeps a copy in the account's Sent folder: delete it with the beta data. Launch: a provider with our own domain; check its log retention, which we cannot erase, and list it in the privacy notice |
| cloud host, database, object storage | everything above | **beta, first: the owner's own computer** (D097), with the data on its disk (device encryption advised); **then a Lightsail server in Mumbai** (D096). Photos on that disk; everything deleted when the test ends. Launch: to choose, India region. Backups: 30-day rolling |
| network: Cloudflare (home mode only, D097) | all traffic passes through it, encrypted between the phone and Cloudflare, then through the tunnel | **planned for the home beta**. API and photo responses are `no-store` or `private`, so they aren't cached; the app's own code files are. Named in the tester notice. Check Cloudflare's privacy terms and log retention before going live |
| push delivery: Expo push service, then Apple (APNs) and Google (FCM) | the push token and the discreet text ("You have a new message."), never names, message text or IDs | **not connected** (needs the owner's EAS project and credentials); the adapter is built and tested against a fake server. Expo's own retention of tickets is a day; check its privacy terms before connecting |
| payments: Razorpay (website) | nothing from us about the member: they enter their payment details in Razorpay's own checkout; we keep only the subscription ID | **not connected** (needs the owner's account and KYC). Razorpay holds payment data under its own terms and RBI rules; check them, and invoicing and GST, before going live (D094) |
| later: SMS, verification vendor, error tracking | only what each needs | each requires a review and an inventory row before use |

## Member rights flows

| right | how | status |
| --- | --- | --- |
| access | a copy of my data, or a summary of what is held and why | **planned** (D086): this inventory is the summary; requests go to the grievance contact until an export exists, before launch |
| correction | edit profile; email change later | profile: done; email change: planned |
| erasure | account deletion from the profile screen (any state) or Privacy; sessions revoked at once; keep the account by signing in within 7 days | **done**: API (12a) and app (12b), web e2e; native device pass pending |
| grievance | in-app and email contact | planned (contact details are owner setup); answer within the DPDP limit of 90 days |
| consent withdrawal | deleting the account withdraws consent to the terms and privacy notice; nothing else is consent-based yet | done through deletion (D086) |
