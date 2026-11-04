# Progress

Updated: 2026-11-04

## Current phase

Stage 8 (discovery) **done for the API and the web build**:
- 8a's API passed CI (api run 41859135328; mobile run 41859135467).
- 8b added the discovery, person and preferences screens: 42 mobile tests, and the e2e journey now reaches discovery.
- 8b's CI run is pending, and a native device pass (NAT-1) is still to do.

Next: stage 9 (matching).

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |
| — | Owner decisions recorded; histories merged (D030); Replica skills vendored (D031); standing rules in `CLAUDE.md` | `decision-log.md`, `.claude/skills/`, `CLAUDE.md` |
| 5 | FastAPI app factory, settings, async SQLAlchemy, RFC 9457 errors, request IDs, privacy-safe logs, body limit, `/healthz`, `/readyz`, OpenAPI at `/v1/openapi.json`; Alembic baseline (4 tables, owner and runtime roles); dev seed; CI workflow; 69 tests. CI run 41823765056 passed | `apps/api/`, `.github/workflows/api.yml` |
| 8b | Screens: today's introductions (empty, not-ready, paused and error states), a person's profile, preferences; e2e extended through discovery with axe | `apps/mobile/src/screens/discover.tsx`, `e2e/` |
| 8a | Discovery API: preferences, eligibility filters before ranking, the deterministic daily set (built once, availability re-checked on read), distance buckets, access to profiles and photos in today's set, rate limits, labelled fixtures; tables for interactions and blocks (D064); migration 0005 | `app/modules/discovery/`, `app/fixtures.py` |
| 7b | Expo SDK 58 app (`apps/mobile`): typed API client from the OpenAPI spec (`packages/api-types`), keystore session, accessible primitives and provisional tokens, 9 screens; web e2e with axe (`e2e/`); CORS allow-list; mobile CI workflow | `apps/mobile/`, `packages/api-types/`, `e2e/`, `.github/workflows/mobile.yml` |
| 7a | Profiles and media API: areas (seeded, no coordinates out), profile create/replace with prompts, privacy (visibility, pause), the one-per-day area limit, the access policy (404 for anything not allowed), safe photo pipeline, private storage with signed URLs, reorder, delete through a queued job; migration 0004 | `app/modules/profiles/`, `app/modules/media/`, `app/policies/`, `app/providers/storage.py` |
| 6 | Auth API: register (age gate, NIST passwords, consents), verify email (code + password, D045), resend, login, logout, logout-all, password reset, `/v1/me` with honest labels; Redis rate limits (fail closed); lockout; procrastinate worker with transactional jobs; email, SMS and identity provider interfaces; migrations 0002-0003 | `apps/api/app/modules/auth/`, `app/providers/`, `app/jobs.py`, `app/ratelimit.py` |

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
- **Not running / not installed:** the Docker daemon, Playwright, and the Android SDK on PATH.
- **Tools:** Replica vendored (D031). REA `rea-agents` 6.8.0 is connected; only for our own builds (D005).
- **GitHub:** repo public (D032). Secret scanning and push protection are enabled. Dependabot alerts are **disabled**.

## Blockers / owner actions

1. Turn on Dependabot alerts and security updates (repo Settings → Code security).
2. **Email provider** (needed before any real sign-up; not blocking development):
   - choose one, for example Amazon SES in ap-south-1, Postmark or Resend;
   - verify a sending domain with SPF, DKIM and DMARC;
   - put the API key in `.env` or a secret manager.
   I then add and test the adapter.
3. **Legal documents:** terms and privacy notice, with legal review. Production refuses the current `draft-2026-11` versions (D044).
4. **Object storage** (needed before any real photo): a private bucket in an India region, for example S3 in ap-south-1 or Cloudflare R2, with an access key for the app. I then add and test the adapter with presigned GETs (D053).
5. SMS stays off until India DLT registration (entity, sender ID, templates) and an SMS provider exist (D012).

## Next

Stage 9: matching. Likes, with an optional comment on a photo or prompt, and passes, with no undo. Then:
- **Atomic mutual matches:** an advisory lock on the pair plus a unique pair constraint, inside one transaction.
- **Limits:** the equal daily like limit for everyone, and the cap on chats awaiting your reply.
- **Visibility:** likes received, matches, and `liked_only` visibility.
- **Tests:** concurrency tests that two reciprocal likes create exactly one match (50 rounds), and that ineligible users cannot match.
- **App:** like and pass on the person screen, and the likes and matches lists.
