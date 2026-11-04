# Test plan

Build: `apps/api` stages 5-7 and `apps/mobile` stage 7b (first screens)  Date: 2026-11-04  Env: owner's Windows 11 laptop (local PostgreSQL 17.5, Redis 7.0.15 in WSL2) and GitHub Actions (Ubuntu, `postgres:17`, `redis:7`)

## Strategy

| level | tool | where it runs | covers |
| --- | --- | --- | --- |
| unit | pytest (API); Jest (mobile, web) | workspace, CI | pure logic: eligibility filters, ranking, validation |
| API / integration | pytest + HTTP client against a real PostgreSQL 17 test database, migrated by the owner role, used by the runtime role, one rolled-back transaction per test | workspace, CI | authorization, constraints, transactions, rate limits |
| concurrency | pytest with parallel sessions | workspace, CI | reciprocal likes create exactly one match; no duplicate messages |
| end-to-end (web) | Playwright driving the installed Chrome | workspace, CI | landing page, admin console, Expo web build of mobile flows |
| accessibility | axe scan inside Playwright specs | workspace, CI | every screen |
| native mobile | manual checklist on a real device | owner's device / CI builds | camera, photo picker, push, deep links |

Rules (from replica-test): one spec per flow; select by role and label, never
CSS classes; fail on console errors and on any 5xx; test our app only, never
load-test or script other apps' services.

Environment notes (2026-11-04, owner's laptop): Playwright is not installed
yet (Chrome 156 and Edge 156 are); the Android SDK and emulator exist but are
not on PATH. On Windows, async tests run on a `SelectorEventLoop` because
psycopg cannot use the default Proactor loop (D039).

## Cases

IDs: `F01-H1` happy path, `F01-E1` edge case, `F01-N1` negative case. Flows
are defined in `recon.md` and routes in `architecture.md`. These are
**planned**: each one gets a result when its stage is built.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | sign up | happy | register as an adult → code → verify | session issued; label reads "age declared, email verified" | api | pass (stage 6) |
| F01-N1 | sign up | negative | register with an under-18 birthdate | rejected; no user, email or code row stored | api | pass: also no job and no Redis counter |
| F01-E1 | sign up | edge | register, resend or reset for unknown and known emails | identical status, body and timing class | api | pass for status and body; timing class by construction (every path hashes or verifies a password; mail is sent by the worker), **not measured** |
| F01-N2 | sign up | negative | wrong code 5 times; expired code; reused code | locked, rejected, rejected | api | pass |
| F01-H2 | sessions | happy | login, logout, logout-all | revoked tokens are refused on every route | api | pass (every protected route so far: `/v1/me`, logout, logout-all) |
| F01-N3 | sessions | negative | password reset while other devices are signed in | every older session refused | api | pass |
| F01-N4 | abuse | negative | burst login, register and code requests | 429 with `Retry-After`; limits per account and IP | api | pass (per email and per IP) |
| F01-E2 | age gate | edge | exactly 18 today; 18 tomorrow; 00:30 IST while the UTC date is still yesterday; future or 120+ years | accepted; rejected; accepted (IST date); rejected | api | pass |
| F01-E3 | sign up | edge | owner signs up, a stranger re-registers the unverified address, owner enters the latest code | refused (password binds the code, D045); owner signs up again and gets in; stranger never can | api + mutation check | pass |
| F01-E4 | codes | edge | 10 failures across two codes, then a new correct code | 429: a new code does not reset the failure count (NIST) | api | pass |
| F01-E5 | sessions | edge | use on day 20 and day 40, then idle 31 days | slides; then expires | api | pass |
| F01-E6 | sign up | edge | real worker delivers the code; two concurrent verifies with it | exactly one 201 and one 400; job row deleted | api + worker (committed scratch DB) | pass |
| F01-N5 | passwords | negative | 14 chars; 129 chars; breached; service-name or email derivative; repetition; NFC length; spaces kept | rejected with `problems`; Unicode counted in code points; spaces preserved | unit + api | pass |
| F01-N6 | lockout | negative | 100th consecutive failure | notice emailed; even the right password gets the generic 401 until a reset | api | pass |
| F01-N7 | abuse | negative | Redis down | 503 `rate_limit_unavailable` on every auth route (fail closed) | api | pass |
| F01-N8 | validation | negative | bad email, date, empty password, unknown fields (`role`), stale consent versions | 422; password never echoed | api | pass |
| F01-H3 | recovery | happy | request reset → code → confirm | new password works, old fails, all sessions revoked, "password changed" notice, code single use | api | pass |
| JOB-1 | jobs | edge | defer then roll back; defer then commit; one job app per process | no row; one row; task names stable | api | pass |
| F02-H1 | profile | happy | create and edit a profile without an intent, then with one | without: validation error; with: saved | api + e2e | pass: API (7a), screen tests and the web e2e (7b) |
| F02-N1 | photos | negative | upload a non-image, a polyglot, > 10 MB, > 40 MP, an animated image | each rejected with a clear problem code | api | pass: polyglots are accepted as images but their payload is discarded by re-encoding (IMG-*) |
| F02-E1 | photos | edge | upload a JPEG with GPS metadata | stored copies contain no metadata | api | pass (unit, API and real dev server) |
| F02-N2 | photos | negative | another member fetches a pending photo | 404 | api | pass (also approved photos without a relation) |
| PRF-H1 | profile | happy | areas and prompts; create, read, replace prompts; readiness | stored and returned; no coordinates anywhere | api | pass |
| PRF-N1 | profile | negative | 18 invalid bodies: contact details in names, control and zero-width characters, bad enums, casual intent, long bio, unknown or duplicate prompts, unknown fields; unknown area | 422 each | api | pass |
| PRF-E1 | profile | edge | names in Devanagari, Bengali, Tamil, and one needing a zero-width joiner | accepted unchanged | api | pass |
| PRF-E2 | location | edge | change area twice within 24 h; then after 24 h | 429 `area_change_limited` with `Retry-After`; then allowed | api | pass |
| PRF-N2 | access | negative | another member's profile; a random ID | identical 404 | api | pass |
| PRF-H2 | privacy | happy | set `liked_only`, pause, empty and invalid bodies, before a profile exists | stored; 422; 422; 409 | api | pass |
| IMG-1 | media | edge | orientation 6; 3000x2000; CMYK; PNG with alpha; WebP; GIF; APNG; animated WebP; truncated; 200 px; 48 MP; header-only 3.6 GP bomb; HTML; PDF; empty; over 10 MB | upright; 1080 and 400 px; RGB JPEG; refused with codes | unit | pass |
| PHO-H1 | photos | happy | upload, fetch through the signed URL, reorder, delete | 201 pending; 200 JPEG without EXIF; compact positions; objects deleted by the queued job | api + real dev server | pass |
| PHO-E1 | photos | edge | expired URL; forged expiry; wrong signature; path traversal | 404 each | api | pass |
| PHO-N1 | photos | negative | 7th photo; unknown form field; no file; 12 MB request; rate limit | 409; 422; 422; 413; 429 | api | pass |
| MOB-1 | mobile | unit | age gate on the India date; impossible dates; consents; email normalisation; password length in code points; names refuse contact details | as the API | jest | pass |
| MOB-2 | mobile | unit | typed client: bearer header, problem parsing (`code`, `Retry-After`, field errors), 401 forgets the session, network failure, app wording for codes | as listed | jest | pass |
| MOB-3 | mobile | screen | sign-up (under-18 stopped before any request; normalised body), verify (code plus remembered password; keystore), sign-in, reset, errors | as listed | jest + RNTL | pass |
| MOB-4 | mobile | screen | profile empty/loaded/error states and honest labels; edit validation and saved shape; area limit; photos list, pick, upload, reorder, delete, refusal; privacy | as listed | jest + RNTL | pass |
| E2E-1 | slice | e2e | Chrome: welcome, sign-up (under-18 refused), mailed code, verify, empty profile, create profile, upload a GPS-tagged photo, signed URL without metadata, privacy, sign out | each step works; axe: no serious or critical issue on 8 screens; no console errors or 5xx | Playwright | pass |
| MOB-5 | mobile | screen | today's cards with bucket labels and no exact km; empty set with the next set time (India); not-ready and paused states; person view and gone state; preferences validation and saved shape | as listed | jest + RNTL | pass |
| E2E-2 | slice | e2e | continuing E2E-1: second photo, ready state, today's introductions (labelled fixtures, bucket in each card's label, at most 15), a fixture's profile, preferences saved | each step works; axe clean on discover, person, preferences | Playwright | pass |
| NAT-1 | native | manual | Android and iOS: keystore survives a restart; photo library permission and picker; keyboard and safe areas; TalkBack and VoiceOver read every control and state | works on a real device | manual | **planned**: needs a device or emulator with Expo Go or a dev build |
| MAT-C1 | match | concurrency | 50 pairs like each other at the same moment over real connections; then the same without the pair lock | exactly one match per pair and exactly one response reports it; without the lock a match is missed | concurrency + mutation | pass |
| MAT-H2 | match | happy | likes received lists the liker (outside the set), profile visible; a match lists both ways; a retry is idempotent; no undo | as listed | api | pass |
| MAT-N2 | match | negative | block either way, suspension or pause after a like; then like back | 404; no match; gone from likes received and profile 404 | api | pass |
| MAT-E1 | match | edge | like notes and items: someone else's photo, a pending photo, an unanswered prompt, both, over 150, a pass with a note; a valid prompt like | 422 each; the note and prompt shown in likes received | api | pass |
| MAT-A1 | access | edge | match keeps profiles and photos visible after the day; a block hides the match and both profiles; `liked_only` seen only after liking | as listed | api | pass |
| MOB-6 | mobile | screen | like with note, pass without, match state, like limit and already-decided messages, likes received, matches | as listed | jest + RNTL | pass |
| PHO-N3 | access | negative | another member: redirect, delete, reorder, list; no session | 404, 404, 422, empty, 401 | api | pass |
| F03-H1 | discovery | happy | build today's set for a seeded viewer | only eligible candidates; at most 15; stable all day | unit + api | pass (DSC-*) |
| F03-E1 | discovery | edge | blocks in either direction; earlier like or pass; paused; hidden | all excluded | api | pass |
| F03-N1 | discovery | negative | inspect every discovery and profile response | no coordinates, exact distance, email or birthdate | api (schema) | pass |
| F03-N2 | discovery | negative | open a profile outside the set, matches or likes received | 404 | api | pass for outside the set (matches and likes: stage 9) |
| DSC-F1 | discovery | negative | 13 single-rule variants next to an eligible member: wrong gender either way, incompatible intent, age outside either side's range, distance beyond either side's limit, `liked_only`, paused, under 2 approved photos, suspended, leaving, no profile | only the eligible one appears | api | pass |
| DSC-F2 | discovery | negative | block by viewer, block by candidate, viewer liked, viewer passed, candidate passed; someone who liked the viewer | excluded; the fan still appears | api + mutation check | pass |
| DSC-H2 | discovery | happy | 20 eligible: size and ranks; best candidate first; second call; a newcomer the same day; the next day | 15, ranks 1-15; best first; identical; waits; appears | api | pass |
| DSC-M1 | discovery | edge | block and pause after the set is built | removed at once; profile 404; others unaffected | api | pass |
| DSC-P1 | location | negative | card content | bucket only (`5_to_15_km`); no coordinates, km, email, birthdate, preferences | api | pass |
| DSC-A1 | access | negative | profile and photos of someone in the set; pending photo; a non-match; the reverse direction | 200 and 302; 404; 404; 404 | api | pass |
| DSC-V1 | discovery | negative | viewer without a profile, with 1 approved photo, paused | 409 `profile_incomplete` or `discovery_paused` | api | pass |
| DSC-R1 | discovery | negative | preferences defaults, invalid ranges and buckets, unknown fields; rate limit; 7-day retention | defaults; 422; 429; old picks deleted | api | pass |
| F04-H1 | match | happy | A likes B, then B likes A | exactly one match | api | pass |
| F04-E1 | match | edge | A and B like each other simultaneously (parallel, 50 rounds) | exactly one match every round | concurrency | pass (MAT-C1) |
| F04-N1 | match | negative | like yourself, or a blocked, paused, ineligible or deleted user | rejected; no match | api | pass |
| F04-N2 | match | negative | exceed the daily like limit | 429 with code `like_limit` | api | pass |
| F05-H1 | chat | happy | send, receive, paginate, read | ordered history; unread counts correct | api | planned |
| F05-E1 | chat | edge | resend with the same `client_message_id`; double tap | one stored message | api | planned |
| F05-E2 | chat | edge | drop the WebSocket, send meanwhile, reconnect | REST catch-up; nothing lost or duplicated | api + ws | planned |
| F05-N1 | chat | negative | a non-participant reads or sends; a stale (unmatched) match; a blocked pair | all refused | api | planned |
| F05-N2 | chat | negative | reuse or expire a realtime ticket | connection refused | ws | planned |
| F06-H1 | safety | happy | block, then probe every path (discovery, profile, media, likes, matches, messages, realtime) | invisible and unreachable on each path | api | planned |
| F06-H2 | safety | happy | report a message | reporter sees the status; it appears in the moderation queue | api | planned |
| F07-H1 | pause | happy | pause discovery | absent from other sets; existing chats keep working | api | planned |
| F09-H1 | delete | happy | delete the account and run the purge job | hidden at once; sessions revoked; data purged; listed exceptions retained | api + job | planned |
| ADM-N1 | admin | negative | a member token calls `/v1/admin/*`; a moderator calls an admin-only route | refused | api | planned |
| ADM-H1 | admin | happy | a moderator actions a report | action applied; audit entry written | api | planned |
| SEC-1 | logging | negative | capture logs through every flow | no message bodies, emails, birthdates, codes or tokens | api | partial: stage 5 paths and the full auth flow pass (also checked on the real dev server); rerun as each flow lands |
| FND-H1 | health | happy | `GET /healthz`; `GET /readyz` with DB and Redis up | 200 `ok`; 200 `ready` with both checks `ok` | api | pass |
| FND-N1 | health | negative | `/readyz` with the DB down, Redis down, both down, or a hanging check | 503 problem `not_ready` naming the failed check; no driver text leaks; `/healthz` still 200 | api | pass |
| FND-H2 | errors | happy | 404, 405, 409 (`ApiError`), 422, 413, 500 | `application/problem+json`, `type` `about:blank`, stable `code`, `request_id` equal to `X-Request-ID` | api | pass |
| FND-N2 | errors | negative | 422 with a password or email in the body; 500 whose exception text holds an email and a token | values never echoed; 500 has no detail, type name or trace | api | pass |
| FND-N3 | validation | negative | unknown body field; every app model; every OpenAPI schema | 422 `extra_forbidden`; all models `extra="forbid"`; `additionalProperties: false` | api + meta | pass |
| FND-N4 | limits | negative | body over 1 MiB, declared and streamed (no `Content-Length`) | 413 `payload_too_large` | api | pass |
| FND-E1 | request IDs | edge | no ID; a safe client ID; unsafe or over-long IDs | UUID generated; safe ID kept; unsafe replaced | api | pass |
| FND-H3 | migrations | happy | upgrade, downgrade to base, upgrade; compare with models; offline `--sql` | tables match each step; no model drift; DDL renders | db | pass |
| FND-N5 | constraints | negative | duplicate `email_normalized`; mixed-case email; unknown status; second live code for the same purpose; 6-byte code hash; duplicate or raw session token | each rejected by the named constraint | db | pass |
| FND-E2 | constraints | edge | new code after consuming the old one; live codes for other purposes or users; user delete | allowed; allowed; sessions and codes cascade | db | pass |
| FND-N6 | privileges | negative | runtime role UPDATE or DELETE on `audit_log`; CREATE, DROP, TRUNCATE, ALTER | `InsufficientPrivilege` each time | db | pass |
| FND-L1 | logging | negative | requests with an email in the path, query and body, a bearer token, a failing insert (PostgreSQL `Key (...)=(...)` detail) and a leaky exception | none of the values appear in the JSON logs; errors are still logged with their type | api | pass |
| FND-L2 | logging | happy | access log fields | route template (never raw path or query), status, method, duration, IP truncated to /24 or /48, request ID | api | pass |
| FND-S1 | seed | happy | run `seed-dev` twice; run with `APP_ENV=production` | 6 labelled `fixture-*@fixture.invalid` accounts with unusable passwords, once; audit entry; refused in production | db + cli | pass |
| FND-C1 | config | negative | DEBUG in production; non-identifier runtime role; secrets in repr | rejected; rejected; masked | unit | pass |
| FND-D1 | docs | happy | `/v1/openapi.json`; `/v1/docs` per environment | served; docs 200 outside production, 404 in production; no `/docs` or `/redoc` | api | pass |

## Results

| date | where | command | result |
| --- | --- | --- | --- |
| 2026-11-04 | owner's laptop (Windows 11, Python 3.13.7, PostgreSQL 17.5, Redis 7.0.15 in WSL2) | `uv run pytest` in `apps/api` | 69 passed, 0 failed |
| 2026-11-04 | same | `ruff format --check`, `ruff check`, `mypy` (strict) | clean |
| 2026-11-04 | same | `pip-audit` on the exported lockfile (hashes required) | no known vulnerabilities |
| 2026-11-04 | same | `alembic upgrade head`, `alembic check` on the dev database | applied; no drift |
| 2026-11-04 | same | dev server (`datingapp-api serve`) probed with curl | `/healthz` 200, `/readyz` 200, `/v1/openapi.json` 200, `/v1/docs` 200, unknown route 404 problem |
| 2026-11-04 | same | procrastinate 3.10.0 smoke test (scratch venv and database) | schema applied; a deferred job ran to `succeeded` (D035) |
| 2026-11-04 | GitHub Actions run 41823765056 (Ubuntu 24.04, Python 3.13, `postgres:17`, `redis:7`) on `1fec2cc` | `.github/workflows/api.yml` | ruff and mypy clean; migrations applied, no drift; 69 passed; pip-audit clean |
| 2026-11-04 | owner's laptop | `uv run pytest` (stage 6) | 141 passed, 0 failed |
| 2026-11-04 | same | `ruff`, `mypy` (strict), `pip-audit`, `alembic check` | clean; no known vulnerabilities; no drift |
| 2026-11-04 | same | dev server and worker, console mail, curl: register → code from the worker → verify → `/me` → logout → `/me` | 202, code printed, 201 with labels age `declared` / email `verified` / identity `not_checked`, 200, 204, 401; 0 server log lines held the email, code or token |
| 2026-11-04 | GitHub Actions run 41828807895 on `7af98c9` | `.github/workflows/api.yml` | ruff and mypy clean; migrations applied, no drift; 141 passed; pip-audit clean |
| 2026-11-04 | owner's laptop | `uv run pytest` (stage 7a) | 196 passed, 0 failed |
| 2026-11-04 | same | dev server, worker and local storage: sign up, profile, upload a GPS-tagged 2400x1600 JPEG, fetch, redirect, delete | 201 pending 1080x720; 0 EXIF tags; 302; 204; both files removed by `media:delete_objects` |
| 2026-11-04 | GitHub Actions run 41832032460 on `d227489` (stage 7a) | `api.yml` | 196 passed; pip-audit clean |
| 2026-11-04 | owner's laptop | `uv run pytest` (API after CORS) | 200 passed |
| 2026-11-04 | same | `npm run typecheck` and `npm test` in `apps/mobile` | clean; 36 passed |
| 2026-11-04 | same | `npm test -w @datingapp/e2e` (Playwright, Chrome, axe) | 1 passed (E2E-1); after fixing the web accessibility state (D059) |
| 2026-11-04 | GitHub Actions api run 41854231637 on `36dc93f` | `api.yml` | 200 passed; pip-audit clean |
| 2026-11-04 | GitHub Actions mobile run 41855746033 on `79b0bd1` | `mobile.yml` | audit (high) clean; contract unchanged; typecheck clean; 36 passed; web export; e2e 1 passed in Chrome on Ubuntu |
| 2026-11-04 | owner's laptop | `uv run pytest` (stage 8a) | 230 passed |
| 2026-11-04 | same | dev server and worker, seeded fixtures, a real sign-up with 2 auto-approved photos (`PHOTO_REVIEW_REQUIRED=false` for the run), `GET /v1/discovery/today` | 5 ranked fixture cards with buckets; no coordinates; profile 200; photo 302; same set twice |
| 2026-11-04 | GitHub Actions api run 41859135328 and mobile run 41859135467 on `48c159b` (stage 8a) | both workflows | 230 passed; mobile checks and e2e passed |
| 2026-11-04 | owner's laptop | `npm test` in `apps/mobile`; e2e (3 runs) | 42 passed; e2e passed every run, after making web scroll containers keyboard-focusable (axe) |
| 2026-11-04 | GitHub Actions mobile run 41861396400 on `3c506de` (stage 8b) | `mobile.yml` | checks passed; e2e (through discovery) passed in Chrome on Ubuntu |
| 2026-11-04 | owner's laptop | `uv run pytest` (stage 9); matching tests 3 runs; mutation without the pair lock | 244 passed; 14/14 each run; the mutation run missed a match (as expected) |
| 2026-11-04 | same | `npm test` in `apps/mobile`; e2e (2 runs) | 49 passed; e2e passed (like with a note, matches and likes empty states) |
| 2026-11-04 | GitHub Actions api run 41872861914 and mobile run 41872861907 on `c3b5da9` (stage 9) | both workflows | 244 passed (incl. MAT-C1 on Ubuntu); mobile checks and e2e passed |
