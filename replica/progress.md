# Progress

Updated: 2026-11-10

## Current phase

**Stage 20 (bold new visual direction, D100) has started.** It covers the landing website and the member app, in stages.
- **20a, tooling and baseline: done (2026-11-10).**
  - impeccable 4.8.2 is installed for this project with its design hook. The engine's checksum was verified; the engine is git-ignored; impeccable's telemetry is off.
  - `PRODUCT.md` (root, web) and `apps/mobile/PRODUCT.md` (android) are written from confirmed facts. Impeccable reads only the child file inside `apps/mobile`, so the two must change together.
  - `.impeccable/config.json` records code-first.
  - Baseline detector: website source 1 warning (a thick left accent border, `globals.css:52`); the live landing page 2 advisories (a lone last word in two lines); the app's source and live welcome screen none.
  - Baseline screenshots in `replica/design/baseline-2026-11-10/`, taken with playwright-cli 0.1.24 and the installed Chrome.
- **20b, the landing page's direction: done (2026-11-10).**
  - **The questions:** the owner chose a waitlist as the page's action, rewritten copy with the same facts, and 'too quiet or plain' as the thing to avoid.
  - **The roll:** it assigned the Ghat Steps, with one competitive challenger (the Segment Count) and five declined. Four first-screen sketches were checked by the hook and in screenshots: 2 contrast failures, a glow, kicker labels, stripes and 3 layout bugs, all fixed.
  - **The choice:** the owner took **The Interchange** (D101) through the question tool, after the decision page closed unanswered.
  - **The contract:** in `apps/web/.impeccable/surfaces/app-page-tsx.md`. Type: Anek, self-hosted.
- **20c, the waitlist API: done and tested locally (2026-11-10; D101, D102).**
  - **Endpoints:** `POST /v1/waitlist`, `/confirm` and `/leave`, plus a confirmation job, migration 0014 (`waitlist_entries`), three retention rules in the sweep, `SITE_URL`, a counts-only CLI, and a waitlist section in the privacy notice.
  - **Tests:** WL-1..14 pass; the full API suite passes (391); 4 mutation checks were caught; ruff and strict mypy are clean; the OpenAPI types were regenerated (additive only).
  - **Not yet:** CI on a push; the website's form and its confirm and leave pages (20d); the opening email (launch).
- **20d, the Interchange landing page: done and tested (2026-11-10; D103, D104).** impeccable's finish review gave ship for its scored fixes; `apps/web/DESIGN.md` and `.impeccable/design.json` record the system; CI is green on `c0fc08c` (e2e 16/16, including the waitlist).
  - **What:**
    - self-hosted Anek (Latin variable 103 KB; Devanagari static 62 KB);
    - a sign band, a tall map on desktop whose line runs unbroken into the stations, and bilingual enamel sign plates;
    - a route key and a direction sign; the candlelight loop in a square frame at the end of the line; a graphite close;
    - the waitlist form twice, and the confirm and leave pages; the notice renamed.
  - **Checks:** web `tsc` and 16 Node tests pass; `detect` finds 0 issues on the rendered pages. CI on the first commit passed api, mobile (web build plus every e2e test, including the waitlist spec) and images. beta-stack failed on the old notice title; fixed in `3efa92c`.
  - **Not yet:**
    - a native Hindi speaker for every string in `apps/web/scripts/devanagari-text.txt`;
    - the live site (needs a rebuild and the owner's go).
- **20e, the member app in the Interchange world: started (2026-11-10; D105).** The owner's choices: a bottom bar (Today · Likes · Matches · You), checks on the owner's Android phone, light only, welcome and sign-up first.
  - **Done (not on a device yet):**
    - static Anek TTFs for the app (four Latin voices at about 44 KB each; Devanagari 2.7 KB for the name only), built reproducibly (`build_fonts.py`, two builds byte-identical) and loaded with expo-font (declared at the SDK's 58.0.11);
    - shared tokens: graphite sign colours, font families per type role (no weights in styles, so Android never fakes a bold), display and sign roles, a square plate radius, a pressed marigold; 36 contrast pairs, 0 failing;
    - primitives as sign plates (marigold primary, graphite-outlined secondary, square fields, checkboxes, chips and badges; notices without the side stripe); graphite app bars with a light status bar;
    - the welcome screen: a name sign (Latin, and Devanagari when configured), the display headline, and a route map built from Views on a white enamel panel, with the rings as its interchange (one accessible image).
  - **Checks:** app `tsc` clean; Jest 128 passed (2 new: MOB-16, MOB-17); web 16 passed.
  - **Not yet:**
    - the check on the owner's phone (waiting for USB debugging and Expo Go);
    - the sign-up, verify, sign-in and reset screens' own pass (they have the new primitives already);
    - e2e on the web build (CI, after a commit);
    - impeccable's finish review and the app's DESIGN.md;
    - the bottom bar (next slice).
  - **Found and fixed:** Prettier, run without a project config, rewrapped six files (about 800 lines). Restored from the commit, with only the real edits re-applied (104/44 lines). The map wasn't one accessible element until `accessible` was set; the welcome test caught it.

Stage 19 (motion and visual polish, D098) **done: CI passed on `4b68e81`** (mobile 42210375883 with e2e 13/13, beta-stack 42210375876, images 42210375717). **On the live beta since 2026-11-07** (owner's go). The web image was built from `0da7ff1`; the only later change to the website is a test, which isn't shipped. The edge image was built from `eb80094`. Checked through Cloudflare: the landing page names the loop files; the media return 200 with their committed sizes; the CSPs allow the media (website `'self'`, app the website's origin); the app bundle names the loop. In headless Chrome (1280 and 390 px), both videos play and loop with no console errors; the app reports one blocked `eval` from Zod's probe (BUG-002, S4, existed before).
- **App:** a motion module (Reveal, press feedback, photo fade-in, screen fade on the web) on React Native's own Animated; the two-ring mark (meet, breathe, join) on the welcome screen, an empty introductions day and a match; list staggers; new chat messages slide in.
- **Website:** a drawn shoreline at dusk behind the landing hero, with a Pause button; the words rise in; feature cards rise in on scroll; feedback on links, buttons and fields.
- **Rules kept:** everything follows reduce motion; no new libraries; nothing moves more than 5 seconds without a pause; no people or fake activity in visuals.
- **Video (D099, 2026-11-07):**
  - **The owner's Canva couple clip was refused:** Canva's licence bars people in promotional material for dating services.
  - **What's used instead:** a people-free candlelight loop (5.5 s, about 470 KB for every size and format).
  - **Where:** a story card on the landing page, and full-screen under a dark overlay behind the app's welcome screen. The overlay has new checked tokens.
  - **Served through Cloudflare** by the owner's explicit choice, despite the CDN terms; it can be switched off (deploy.md).
- **Sizes:** app web JS +2 KB gzipped; website JS +12 KB, CSS +3 KB; no video.

**The closed beta (D096, D097)** has been running on this laptop since 2026-11-06.
- Gmail sending works (the app password was checked against Gmail).
- The owner has a member account and a separate staff account (`+admin`), made admin through the runbook and audited. The staff authenticator is enrolled and has been used to sign in (checked 2026-11-08).
- **This laptop is the live server.** It has 8 GB, and only 0.1-0.7 GB was free during test runs, so the WSL Redis used by tests stopped. Heavy local builds and test runs compete with the beta; prefer CI for them.
- **Outage, 2026-11-07 19:10-19:15 IST:** after the laptop restarted, the site returned Cloudflare 530 because Docker Desktop didn't start. Its "Start Docker Desktop when you sign in" setting is off (deploy.md asks for it on). Starting Docker brought every container back healthy. The owner has since turned the setting on (checked 2026-11-08).
- **Backups (BETA-5, 2026-11-08):** the first backups exist in `%USERPROFILE%\datingapp-backups`, and a restore into a scratch database matched every table's row count. The home run had never saved photos (BUG-003, fixed in `backup.sh`). Photo restore stays untested until there are photos. The owner registered the daily 03:00 task (`infra/beta/schedule-backup.ps1`); its first run (06:01) returned 0 and logged a good backup.
- **Outage, 2026-11-08 to 2026-11-10 (about 44 hours or more):** the laptop ran on battery with the lid closed. It went into standby at 08:01 on Nov 8 (reason: lid), then hibernated at 14:16 when its 6-hour battery timer ran out, and only woke at 10:04 on Nov 10. The containers were back at 10:28. Both nightly backups were missed.
  - The 10:10 catch-up backup wrote a good dump (292 objects), but its photo step was killed (`0xC000013A`). Docker was still recovering then, and restarted every container at 10:28. Its 0-byte archive was deleted, and a complete backup was taken at 11:42.
  - Settings on mains power are right (never sleep or hibernate). The cause is running unplugged: the beta needs the laptop plugged in with the lid open, or a real server (gate 5).
- **Next (owner):** copy the backups off the laptop weekly; the first testers' invites.

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |
| — | Owner decisions recorded; histories merged (D030); Replica skills vendored (D031); standing rules in `CLAUDE.md` | `decision-log.md`, `.claude/skills/`, `CLAUDE.md` |
| 5 | FastAPI app factory, settings, async SQLAlchemy, RFC 9457 errors, request IDs, privacy-safe logs, body limit, `/healthz`, `/readyz`, OpenAPI at `/v1/openapi.json`; Alembic baseline (4 tables, owner and runtime roles); dev seed; CI workflow; 69 tests. CI run 41823765056 passed | `apps/api/`, `.github/workflows/api.yml` |
| 19 | Motion and visual polish: motion tokens, the app's motion module and ring mark, list staggers, chat arrivals, photo fade-in, the landing shoreline with a pause control, CSS micro-interactions, a dormant video slot with its CSP; everything follows reduce motion; e2e runs still by default plus a motion spec | `apps/mobile/src/ui/motion.tsx`, `apps/mobile/src/ui/Rings.tsx`, `apps/web/app/HeroBackdrop.tsx`, `apps/web/lib/heroVideo.ts`, `replica/design/components.md` |
| 18d | Home mode: `compose.tunnel.yaml` (Cloudflare Tunnel, no open ports, only the tunnel may name the visitor), the notice's hosting wording, the `home-mode` CI job, the home guide in deploy.md | `infra/beta/compose.tunnel.yaml`, `apps/web/lib/documents.ts` |
| 18c | One-server kit for the beta: compose (PostgreSQL, Redis, API, worker, web, Caddy with the app's web build), automatic HTTPS, only 80/443 published, secrets made on the server, backups; the app's CSP shared with e2e; the beta-stack CI workflow | `infra/beta/`, `.github/workflows/beta.yml`, deploy.md |
| 18b | Tester notice (terms and privacy for the beta, website pages, linked at sign-up); Android beta build settings that refuse placeholders; invite-only hint | `apps/web/app/privacy`, `apps/web/app/terms`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json` |
| 18a | Closed beta, server side: SMTP email over TLS (stdlib, fake-server tested), the `beta` environment, invite-only sign-up (HMAC list, `datingapp-api invite`), invites swept at 30 days; migration 0013 | `app/providers/email.py`, `app/config.py`, `migrations/versions/0013_signup_invites.py` |
| 17 | Release readiness: preflight run and recorded; container images for the API, worker and web, built and smoke-tested in CI (never pushed); `TRUSTED_PROXIES`; production guards for test backends and http origins; a complete `.env.example` with a test; original placeholder icons; rebrand sweep; the staging plan and runbooks (planned) | `replica/deploy.md`, `apps/*/Dockerfile`, `.github/workflows/images.yml` |
| 16b | Billing rules evaluated (Apple, Google Play in India, Razorpay); the payment-provider interface, a Razorpay adapter (fake-server tested), signed and deduplicated webhooks, a server-side entitlement, cancel at cycle end, cancellation on deletion, a live-key guard; migration 0012 | `replica/launch/pricing.md`, `app/modules/billing/`, `app/providers/payments.py` |
| 16a | Discreet notifications: push devices tied to sessions, fixed sentences with kind-only data, preferences, throttles, team notices for warnings, an Expo adapter (fake-server tested) with receipts, the app's settings screen and notices; migration 0011 | `app/modules/notifications/`, `apps/mobile/src/notifications/` |
| 15 | Audit: feature matrix checked row by row with evidence under one status rule (D092); architecture checked against the code (endpoints, jobs, tables); every test level run; route inventory test; recovery e2e; BUG-001 (the 404 page's CSP) fixed; stale threat-model and architecture statements corrected; `bugs.md` started | `replica/features.csv`, `replica/bugs.md`, `tests/test_route_inventory.py` |
| 14b | Next.js landing page and staff console (queue, report detail and actions, photo review, audit log, staff authenticator resets) as a backend for the browser: HttpOnly `__Host-` cookies, server-side session checks on every page and action, nonce CSP; web e2e with axe | `apps/web/`, `e2e/tests/admin.spec.ts` |
| 14a | Staff sign-in with a second factor: password, then a TOTP code or recovery code; enrolment only with a one-time token from another admin or the server CLI; secrets encrypted; codes work once; separate `web_admin` sessions (12 h, 30 min idle); migration 0010 | `app/modules/staff/` |
| 13 | Design system: role tokens checked for contrast and kept equal to `replica/design/tokens.json` by a test; type scale, 48-point targets, web focus rings, distinct pressed and disabled states; Caption, TextLink, Badge, Card, Thumb; the peacock and marigold palette; a `/design` gallery with axe, focus, field and reflow checks; applied across the screens | `replica/design/`, `apps/mobile/src/ui/primitives.tsx` |
| 12b | Delete-account screen (from the profile in any state and from Privacy), the welcome-screen date, Keep my account on sign-in, Privacy hints that say what visibility and pause do; e2e of delete, keep and delete again | `apps/mobile/src/screens/account.tsx`, `e2e/tests/privacy.spec.ts` |
| 12a | Account deletion (password, 7-day restore, purge through the database cascade, photo files by a queued job, report hold, banned-email hash), retention sweep (conversations, picks, sessions, codes, unverified sign-ups, reports, records), expired audit records through an owner-rights function, the store review; migration 0009 | `app/modules/privacy/`, `privacy-data-inventory.md` |
| 11b | Unmatch, Block and Report on chats and profiles (with confirmations), the report form, the Safety screen (blocks, report statuses), removed messages, `match.closed` in the app; e2e report flow | `apps/mobile/src/screens/safety.tsx` |
| 11a | Block, unblock and unmatch (closing the match under the send lock), reports with a copy of the reported message and a visible status, the moderation queue, photo review, account actions, message removal, staff roles, audited reads and actions, append-only moderation records; migration 0008 | `app/modules/safety/`, `app/modules/moderation/` |
| 10b | Chat screen (history, send with retry by the same ID, the hurtful-word prompt, the money tip, read pointer, older pages), matches list with last message, unread and your turn, realtime client (tickets, catch-up, backoff, heartbeat watchdog, close codes); two-person e2e on a fresh database per run | `apps/mobile/src/screens/chat.tsx`, `apps/mobile/src/realtime/`, `e2e/tests/chat.spec.ts` |
| 10a | Messages in open matches (idempotent, gap-free numbering under the match row lock), history pages, read pointers and unread counts, the your-turn cap, nudge lists, realtime hints over WebSockets (tickets, one Redis channel, revocation, caps); migration 0007 | `app/modules/messaging/`, `app/modules/realtime/`, `app/realtime.py` |
| 9 | Likes and passes (no undo, idempotent retries), the equal daily like limit, notes on likes, atomic mutual matches, likes received, matches, access through likes and matches; Like and Pass on profiles, likes and matches screens; migration 0006 | `app/modules/matching/`, `apps/mobile/src/screens/matching.tsx` |
| 8b | Screens: today's introductions (empty, not-ready, paused and error states), a person's profile, preferences; e2e extended through discovery with axe | `apps/mobile/src/screens/discover.tsx`, `e2e/` |
| 8a | Discovery API: preferences, eligibility filters before ranking, the deterministic daily set (built once, availability re-checked on read), distance buckets, access to profiles and photos in today's set, rate limits, labelled fixtures; tables for interactions and blocks (D064); migration 0005 | `app/modules/discovery/`, `app/fixtures.py` |
| 7b | Expo SDK 58 app (`apps/mobile`): typed API client from the OpenAPI spec (`packages/api-types`), keystore session, accessible primitives and provisional tokens, 9 screens; web e2e with axe (`e2e/`); CORS allow-list; mobile CI workflow | `apps/mobile/`, `packages/api-types/`, `e2e/`, `.github/workflows/mobile.yml` |
| 7a | Profiles and media API: areas (seeded, no coordinates out), profile create/replace with prompts, privacy (visibility, pause), the one-per-day area limit, the access policy (404 for anything not allowed), safe photo pipeline, private storage with signed URLs, reorder, delete through a queued job; migration 0004 | `app/modules/profiles/`, `app/modules/media/`, `app/policies/`, `app/providers/storage.py` |
| 6 | Auth API: register (age gate, NIST passwords, consents), verify email (code + password, D045), resend, login, logout, logout-all, password reset, `/v1/me` with honest labels; Redis rate limits (fail closed); lockout; procrastinate worker with transactional jobs; email, SMS and identity provider interfaces; migrations 0002-0003 | `apps/api/app/modules/auth/`, `app/providers/`, `app/jobs.py`, `app/ratelimit.py` |

## Stage 19 status

- **Implemented and tested:**
  - MOT-1..8 (app), WEB-6 and VID-1..4 (web), E2E-9..12 (browser).
  - Mutation checks: ignoring reduce motion, and an endless breathing loop, each fail a test.
- **Checked by eye:** the screenshots at 390 and 1280 px (landing) and of the welcome screen. The words never sit on the waves.
- **Found and fixed:**
  - The landing hero's words needed space reserved below them, so the waves never overlap text at any width.
  - The website's CSP needed `media-src` before any video could be allowed.
- **Not done:**
  - Real video: done (D099).
  - Motion on a physical phone (part of NAT-1).
  - Updating the live beta: done 2026-11-07.

## Stage 17 status

- **Implemented and tested:** OPS-1..5 in `test-plan.md`. The images workflow ran every smoke step.
- **Found and fixed:**
  - The app still shipped Expo's template icons, Expo's own logo; they're now an original placeholder.
  - `.env.example` listed 13 of 58 settings, and said rotating `APP_SECRET_KEY` voids "live codes only". It also breaks staff authenticators, banned-email hashes and photo links.
  - Forwarded client IPs were ignored outright (`proxy_headers=False`): safe, but behind a load balancer every member would share one rate-limit bucket. Now there's an explicit trusted list.
  - A worker test's scratch-database teardown could race a closing pool; it now waits.
- **Planned only (deploy.md):**
  - the staging environment;
  - DNS, TLS, monitoring and backups;
  - EAS builds;
  - the incident and data-breach runbooks (DPDP Rule 7, in force from 2027-05-13, followed from day one).

## Stage 16b status

- **Evaluated** (`launch/pricing.md`, D094):
  - In India the iOS app must sell the plan through in-app purchase and can't mention the web price.
  - Android uses Play Billing, with user-choice billing possible.
  - Razorpay serves the website.
  - Recommendation: no paid plan during the beta.
- **Implemented and tested:** BIL-1..8.
- **Mutation checks:** each of these breaks a test: no signature check, no stale-event check.
- **Not built (owner decisions and accounts):**
  - what the plan includes and its price;
  - the website checkout screen (it also needs Razorpay's script allowed in the CSP);
  - in-app purchase and Play Billing;
  - a run in Razorpay's sandbox (needs a public URL for webhooks, stage 17).

## Stage 16a status

- **Implemented and tested:** NTF-1..9 and MOB-12 in `test-plan.md`, plus a Notifications step in the onboarding e2e.
- **Mutation checks:** each of these breaks a test: no live-session check (pushes would reach signed-out phones), no throttle.
- **Blocked (owner):** delivery needs an EAS project ID in the app config, Firebase credentials (Android) and an Apple developer account (iOS). Until then the app says notifications aren't available in this build, and the API sends nothing (`PUSH_BACKEND=none`).
- **Not yet:** a device pass for push (NAT-1).

## Stage 15 audit

| check | result |
| --- | --- |
| feature matrix | every `yes` names its tests (D092). 17 of 20 must-haves; parity 74.1. Partial must-haves: email registration and recovery (no email provider), photos (no bucket) |
| architecture against code | 51 endpoints, 7 jobs and every table accounted for. 4 tables were missing from the data model (added) |
| routes | 14 public by design, 33 member, 11 staff. A test now fails on any route without a session (AUD-1, mutation-checked) |
| API | ruff, format and mypy clean; 320 tests pass; pip-audit clean |
| app | typecheck; 103 tests pass; the web export works |
| web | 2 tests pass; the build and typecheck pass |
| e2e | 8 tests across 6 specs passed in each of 2 runs; axe on every screen |
| supply chain | npm: 0 high or critical; 24 moderate or low, all in development tooling |
| design | contrast 26 pairs, 0 failing AA |
| security read-through | T03, T05, T11, T15, T20 and T21 updated to what's built; test IDs that didn't exist fixed |

- **Found and fixed:**
  - BUG-001 (S4): the built-in 404 page had no CSP nonce, so its scripts and styles were blocked. Our own 404 page now renders per request.
  - Password recovery had no browser test; E2E-7 covers it now.
- **Release gates** (all features at once):
  - the native device pass (NAT-1);
  - deployment with TLS (stage 17);
  - owner setup: email provider and DNS, bucket, legal documents, Dependabot, SMS/DLT, trademark.

## Stage 14b status and build log

| screen | state | notes |
| --- | --- | --- |
| landing | done | built features only, not open yet; CSP; axe and reflow |
| staff sign-in | done | password, enrolment token, key and otpauth link, code, recovery codes; axe on each step |
| reports, report | done | queue by urgency; reported item, message copy, what members saw, history; resolve; reinstate (admin) |
| photos | done | approve or reject; your own photos never shown to you |
| audit log, staff | done | admins only (the API decides); authenticator reset shows the token once |

- **Found and fixed:**
  - React resets a form after an action, so a wrong password also wiped the email; it's now kept.
  - The final sign-in step re-rendered the route without its page title (axe); it's now set explicitly.
  - The seeded fixtures can't sign in (undeliverable domain, by design), so the e2e creates its own labelled admin, in the e2e database only.
  - The format check failed CI for 14a: I'd formatted `app` and `tests` but not `migrations`. I now run CI's exact commands over the whole project.
- **Not yet:**
  - QR codes for enrolment.
  - A static not-found page without the nonce.
  - Deployment and TLS (stage 17).

## Stage 14a status

- **Implemented and tested:** STF-1..7 in `test-plan.md`.
- **Mutation checks:** each of these breaks a test: no replay check, no session separation, no enrolment token, no idle timeout.
- **Found and fixed:**
  - Tests moving the clock forward days at a time now use fresh staff sessions: the 12-hour limit applies to them too.
  - The enrolment step read the email after a rollback, which expired it.
- **Not yet:**
  - The console (14b).
  - WebAuthn passkeys as a stronger second factor (later).
  - A device list.

## Stage 13 status

- **Implemented and tested:** DS-1..3 and E2E-6 in `test-plan.md`; specs in `replica/design/components.md`. Screens behave as before: every earlier test and e2e passes, and only the matches test changed, from one status line to two badges.
- **Found and fixed:**
  - Spinners were unnamed progressbars on the web, in every busy button and loading screen (axe on the gallery).
  - Chrome drew its own dark ring over focused fields; `outline-width: 0` doesn't remove `outline-style: auto` (gallery screenshot).
  - The berry accent and the danger red were 5 degrees of hue apart, so destructive buttons looked ordinary. The accent is now peacock teal (D089).
  - Cards (introductions, likes, matches) had headings inside buttons.
  - iOS doesn't announce live regions, so errors now announce themselves there.
- **Partial, by design:**
  - Dark mode is deferred (D088).
  - No custom font: system fonts cover Devanagari and Gurmukhi.
  - VoiceOver, TalkBack and 200% system text need the native pass (NAT-1).

## Stage 12b build log

| screen | state | notes |
| --- | --- | --- |
| delete account | done | what happens, kept, unreachable; password; errors; e2e and axe |
| welcome | done | after a deletion: the India date and how to keep the account; axe |
| sign in | done | "waiting to be deleted" with the date, Keep my account; e2e and axe |
| privacy | done | hints for visibility and pause; the way to deletion; axe (onboarding spec) |

- **Found and fixed:**
  - The delete link sat only in Privacy, which needs a profile, so a member who never finished sign-up couldn't delete the account from the app. Profile now shows the link in every state (D087).
  - The Privacy hints didn't say that "Only people I have liked" keeps you out of introductions, or that pausing holds back likes you've sent.

## Stage 12a status

- **Implemented and tested:** F09-H1 and PRIV-* in `test-plan.md`. The purge is checked table by table, and photo files are checked in storage. Every retention rule is checked one step either side of its period. The real worker runs all three privacy jobs.
- **Mutation checks:** each of these breaks a test: no report hold, no barred-email check, no session revocation, no re-check under the row lock.
- **Found and fixed:**
  - Unverified sign-ups were kept forever (email, password hash, birthdate); they're now deleted after 7 days.
  - A reinstated account that was waiting for deletion would have become active with its deletion date still set; it now goes back to waiting.
  - procrastinate keeps an external pool after closing, so a second worker test reused a closed pool. Production opens once per process; the tests reset it (D085).
- **Partial, by design:**
  - The app screens are 12b.
  - The data export is planned before launch (D086).
  - Erasure for suspended or banned members goes through the grievance contact until the staff console (stage 14).
- **Residual:**
  - Orphaned files if a deletion job fails 8 times (needs a reconciliation sweep with the bucket adapter).
  - Periods marked (R) need legal review.

## Stage 11b build log

| screen | state | notes |
| --- | --- | --- |
| chat, person | done | Unmatch (chat), Block, Report; the first two ask first; e2e |
| report | done | reasons, their latest messages, details, also block (default on), sent state; e2e and axe |
| safety | done | blocked people with unblock, my reports with status; e2e and axe |

- **Found and fixed:** CI failed on a Jest timeout. With no transform cache, as on CI, the first screen test in a file pays the one-time cost of compiling React Native modules and passed 5 s; warm, the whole file takes 4 s. The test timeout is now 30 s; from a cleared cache all 86 tests pass in 53 s.

## Stage 11a status

- **Implemented and tested:** F06-*, ADM-*, SAF-* and MODR-* in `test-plan.md`.
- **Mutation checks:** without the send lock, a message is stored after a block; without the staff check, a member reads the queue.
- **Partial, by design:**
  - No app screens yet (11b); the staff console is stage 14.
  - Warnings are recorded but not sent (notifications, stage 16).
  - Purging conversations 30 days after they end, and the banned-email hash, come with retention in stage 12.
  - The duplicate photo-hash signal is not used yet.
- **Release blocker:** `/v1/admin` must require separate staff sessions with two-factor authentication (stage 14) before any deployment (D081).

## Stage 10b status and build log

| screen | state | notes |
| --- | --- | --- |
| chat | done | sending, not sent and retry, the hurtful-word prompt, the money tip, the storage note, older pages, gone; live updates; e2e and axe |
| matches | done | last message, unread, "your turn", the waiting notice; updates live; e2e and axe |
| like | done | the your-turn message |

- **Found and fixed:**
  - The e2e used the developer's database, so earlier runs' members could crowd a new member's daily set; each run now gets a fresh database (D078).
  - The matches list showed the UTC date; dates and times are now in India time.
  - Locators found text twice: the matches list stays mounted under the chat and shows the same preview, so the spec reads messages by list item.
- **Not done:** a native device run (NAT-1), now also for the realtime connection and the keyboard behaviour of the composer.

## Stage 10a status

- **Implemented and tested:** F05-*, MSG-* and RT-* in `test-plan.md`.
  - Concurrent sends from both people, with double taps and a reader polling `after=`, give gap-free numbers and one stored row per message (MSG-C1).
  - Real-time tests run a real uvicorn server and WebSocket client, with a second app instance standing in for another API process.
- **Mutation checks:** without the send lock, sends collide; with reusable tickets, the reuse test fails.
- **Found and fixed:**
  - PostgreSQL returned timestamps in the server's zone (Asia/Calcutta here, UTC in CI); sessions are now pinned to UTC (D076).
  - The age-gate test helper used the UTC date and failed every evening (D076).
  - Uvicorn logged WebSocket handshakes with the full IP and the ticket in the query string; filtered (D074).
  - The hub fixed the connection cap at start-up, so changed settings were ignored; the router now passes the current settings.
- **Partial, by design:**
  - No app screens yet (10b).
  - Unmatch, the block API and message removal come in stage 11; the 30-day purge after unmatch in stages 11-12.
  - The nudge lists are a starter list for moderators to tune (D075).

## Stage 9 status

- **Implemented and tested:** cases F04-*, MAT-* and MOB-6.
  - Two simultaneous reciprocal likes create exactly one match, over 50 rounds on real connections.
  - Ineligible people (blocked, suspended, paused, unreachable) cannot be liked or matched.
- **Found and fixed:** the concurrency test found a deadlock. `FOR UPDATE` on a user row blocked other transactions' foreign-key checks; referenced rows are now locked with `FOR NO KEY UPDATE` everywhere (D071).
- **Mutation check:** removing the pair lock makes a match go missing.
- **Partial, by design:**
  - The your-turn cap needs messages (stage 10).
  - Unmatch and the block API come in stage 11; matches already hide on a block.
  - In the app a like can carry a note, but not yet a chosen photo or prompt.

## Stage 8b build log

| screen | state | notes |
| --- | --- | --- |
| today's introductions | done | bucket labels only; empty set shows the next set time in India; e2e and axe |
| person | done | approved photos, prompts, bio; "no longer available" state; e2e and axe |
| preferences | done | age range and distance bucket; "applies from your next set"; e2e and axe |

- **Found and fixed:**
  - Screens without controls could not be scrolled by keyboard on web (axe, WCAG 2.1.1); the scroll container is now focusable on web (D069).
  - An un-awaited RNTL `unmount()` broke the next test.

## Stage 8a status

- **Implemented and tested** (cases F03-*, DSC-* in `test-plan.md`): every filter in the brief is in SQL before ranking, tested one rule at a time:
  - adult, reciprocal gender, age and distance;
  - intent compatibility;
  - visibility and pause;
  - blocks both ways;
  - prior interactions.
- **Also covered:** the set is finite (15), deterministic and stable all day; people who become unavailable leave at once; responses carry only distance buckets.
- **Smoke run:** the real dev server with seeded, labelled fixtures returned 5 ranked cards.
- **Partial, by design:**
  - Likes and passes have no API until stage 9, and the block API waits for stage 11 (both tables exist and are filtered on).
  - `liked_only` members stay out of discovery until likes exist.
  - Own photos stay pending until moderation (stage 11), so a real member can't browse without `PHOTO_REVIEW_REQUIRED=false` in development.
- **Found and fixed:**
  - SQLAlchemy 2.1 deprecates `ARRAY.any()`; warnings-as-errors turned it into a 500 in tests.
  - The `distance_bucket` column was too short; caught before the migration left the laptop.
- **Residual:** exposure fairness (D067); no popularity cap yet.

## Stage 7b status and build log

| screen | state | notes |
| --- | --- | --- |
| welcome | done | e2e and axe |
| sign-up | done | age gate on the India date before any request; consents; e2e |
| verify | done | code plus the remembered password (D045); resend; e2e |
| sign-in | done | screen tests |
| reset | partial | screen tests; no e2e yet; needs a real email provider |
| profile | done | empty, loading, error and filled states; honest labels; e2e |
| edit profile | done | the area picker is a long chip list (searchable picker later) |
| photos | done | picker, upload, reorder with buttons (no drag yet), delete; e2e upload |
| privacy | done | e2e |

- **Found and fixed:**
  - React Native Web ignored `accessibilityState`, so checkboxes had no checked state for screen readers on web. The axe scan caught it; the app now uses `role` and `aria-*` (D059).
  - TanStack Query's GC timers kept Jest alive for 5 minutes.
  - RNTL 14 needs `await` on `render` and events.
  - Flaky e2e locator in CI: the profile screen (still mounted under the photos screen) used the same image label as the photo list. The cover now has its own label, and the run is stable (4 local passes in a row).
- **Not done:**
  - A native device run (NAT-1: keystore, photo library, TalkBack and VoiceOver). Needs a device or an emulator with Expo Go or a dev build; the Android SDK exists on this laptop but isn't on PATH.
  - ESLint for the TypeScript code (typecheck only so far).
  - Hindi strings.

## Stage 7a status

- **Implemented and tested** (cases F02-*, PRF-*, IMG-1, PHO-* in `test-plan.md`): everything in the stage 7 brief except the app screens.
  - Persistence, permissions, invalid uploads and deletion are tested.
  - The real dev server, worker and local storage were exercised end to end.
- **Partial, by design:**
  - Photos stay pending; the review queue comes with moderation (stage 11).
  - Another member's profile is always a 404 until stages 8-9 add the daily set, matches and likes.
  - Visibility and pause are stored; discovery applies them (stage 8).
  - Storage is local disk until the owner sets up a bucket.
- **Fixed during the stage:** FastAPI's generated upload form allowed unknown fields (D055), caught by the OpenAPI meta-test.

## Stage 6 status

- **Implemented and tested** (cases F01-* and JOB-1 in `test-plan.md`): every flow in the stage 6 brief, via the API.
  - Authorization, rate limits (per email and per IP), validation and failure cases are tested.
  - The real worker runs end to end, and two concurrent verifications produce exactly one session.
- **Fixed from stage 5:** OpenAPI now documents errors as `application/problem+json`.
- **Partial, by design:**
  - No app screens yet (stage 7).
  - Email goes to the worker console in development; no real provider is connected.
  - SMS and identity checks are interfaces only.
  - Parity is 6.9/100, with 0 of 20 must-haves done (`parity.py`).
- **Residual:** enumeration timing is equalised by construction, not measured.
- **Deploy note (stage 17):** keep PostgreSQL's `log_parameter_max_length_on_error = 0` (the default) and `log_statement = none`. Failed statements are logged with placeholders only, as CI showed; parameter values would include emails.
- **Fixed during the stage:**
  - procrastinate renamed tasks when a second app was built (D046).
  - The model-level whitespace stripping would have trimmed passwords; password fields now keep spaces.

## Environment (owner's Windows 11 laptop, verified 2026-11-04)

- **Installed:** Node 22.23.4, npm 11.19, Python 3.13.7 (`py` launcher), uv 0.11.25, git 2.51, gh 2.81 (signed in, admin), JDK 25, Chrome 156, Edge 156.
- **Dev services (D034):**
  - PostgreSQL 17.5: a private cluster on port 55432, data in `%LOCALAPPDATA%\datingapp-dev\pg17`. Start it with `pg_ctl -D <dir> -l <dir>\..\pg17.log start` (PostgreSQL 17 `bin`).
  - Redis 7.0.15: in WSL2 on port 6380, `wsl -e redis-server --port 6380 --bind 127.0.0.1 --save '' --appendonly no --daemonize yes`. Neither starts automatically.
- **Untouched:** the owner's own PostgreSQL 17 and 18 services (5432, 5433).
- **Docker Desktop** now runs the closed beta (home mode, D097). Playwright drives the installed Chrome. The Android SDK is still not on PATH.
- **Memory:** 8 GB, and the beta, Docker's VM and test runs share it. On 2026-11-06 the WSL distro holding the test Redis stopped starting (`Wsl/Service/WSAETIMEDOUT`) with 0.1 GB free. A throwaway container (`docker run --rm -d --name e2e-test-redis -p 127.0.0.1:6380:6379 redis:7`) served the tests instead.
- **Tools:** Replica vendored (D031). REA `rea-agents` 6.8.0 is connected; only for our own builds (D005).
- **GitHub:** repo public (D032). Secret scanning and push protection are enabled. Dependabot alerts are on (seen 2026-11-10): 3 open in npm packages, `minimatch` and `glob` (moderate, fixes available) and `deepmerge` (low, development only, no fix).

## Blockers / owner actions

0. **Before any deployment:** see `deploy.md` (release gates). Staff two-factor sign-in and the console are done (D090-D091) and need TLS in front of them. The first admin's bootstrap is in the deploy runbooks.
1. Dependabot alerts are on; 3 are open (Environment). Security updates: unchecked.
2. **Email provider** (needed before any real sign-up; not blocking development):
   - choose one, for example Amazon SES in ap-south-1, Postmark or Resend;
   - verify a sending domain with SPF, DKIM and DMARC;
   - put the API key in `.env` or a secret manager.
   I then add and test the adapter.
3. **Legal documents:** terms and privacy notice, with legal review. Production refuses the current `draft-2026-11` versions (D044).
4. **Object storage** (needed before any real photo): a private bucket in an India region, for example S3 in ap-south-1 or Cloudflare R2, with an access key for the app. I then add and test the adapter with presigned GETs (D053).
5. SMS stays off until India DLT registration (entity, sender ID, templates) and an SMS provider exist (D012).
6. **Name:** Haanji failed screening on 2026-11-05: a matrimonial service (Radio Haanji's "Haanji Rishte") and a relationships check-in app use it, and every domain is taken. The lean is Kinaara (kinaara.in and kinaara.app are free). Next: the owner runs the IP India search (it needs a sign-in), then an attorney's opinion (`brand.md`).

## Next

All planned stages are done. The single best next step is owner setup: the email provider and its DNS, and the private bucket (deploy.md, gates 1-2). Their adapters are the last missing engineering for the 3 must-haves. After that, the native device pass, then a staging run behind TLS, when authorized.
