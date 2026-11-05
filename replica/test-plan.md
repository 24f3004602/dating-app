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
| MSG-N1 | chat | negative | a stranger, an unknown match ID, no session | 404 on send, history, read and the match; 401 | api | pass |
| MSG-N2 | chat | negative | the match closed, a block either way, the partner suspended or leaving | 404 everywhere; the match leaves the list; nothing stored | api | pass |
| MSG-V1 | chat | negative | empty, blank, 2,001 characters, control and bidi characters, bad or missing ID, an extra field; Devanagari with a joiner | 422 each; the last is stored | api | pass |
| MSG-P1 | chat | edge | pages: latest, `before`, `after`, both (422), limits | correct numbers and `has_more` | api | pass |
| MSG-R1 | chat | negative | 31 sends in a minute | the 31st is 429 | api | pass |
| MSG-L1 | privacy | negative | message text in logs | absent | api | pass |
| MSG-T1 | chat | edge | five chats awaiting reply, then a like; a pass; reply, then like; old and blocked chats | 409 `your_turn_limit` with `waiting`; pass allowed; like allowed; not counted | api | pass |
| MSG-U1 | chat | edge | nudge flags: case, fullwidth, phrases, whole words, Devanagari; the money tip only for the recipient | as listed; nothing blocked | api | pass |
| MSG-C1 | chat | concurrency | both people send at once, each message twice (double tap), while a reader polls `after=`; then without the match row lock | numbers 1..N, no gap or duplicate, one row per message, the reader never sees a gap; without the lock, sends collide (500) | concurrency + mutation | pass |
| RT-1 | realtime | happy | hints to both people across two API processes; read pointer hint to my devices only; a mutual like announced to both | IDs only, no text; no read receipts | real uvicorn + ws | pass |
| RT-2 | realtime | negative | ticket reused, expired, garbage, empty, oversized, of a signed-out session; ticket without a session | handshake refused (403); 401 | real uvicorn + ws; mutation (GET instead of GETDEL) caught | pass |
| RT-3 | realtime | edge | disconnect, two messages meanwhile, reconnect, catch up `after=`, then live | nothing lost or duplicated | real uvicorn + ws | pass |
| RT-4 | realtime | negative | a block, then the other person sends | 404, and no hint | real uvicorn + ws | pass |
| RT-5 | realtime | negative | sign out on one device; sign out everywhere | that session's connection closes 4401, the other stays; then 4401 | real uvicorn + ws | pass |
| RT-6 | realtime | negative | session revoked or account suspended without an event | closed 4401 at the next re-check | real uvicorn + ws | pass |
| RT-7 | realtime | edge | heartbeats; a third connection with a cap of 2; a slot freed | ping; 4429; accepted | real uvicorn + ws | pass |
| RT-8 | realtime | edge | a flooding client; Redis drops the subscriber; Redis resubscribes | 1008; 1012 then recovery; `resync` | real uvicorn + ws | pass |
| RT-9 | privacy | negative | handshake logs | no ticket, no query string, no full IP; one `realtime.closed` record | real uvicorn + ws | pass |
| MOB-7 | mobile | screen | chat: history with names and India times, the money tip, the storage note, send with a fresh UUID and "Sending" until confirmed, a failed send retried with the same ID, the hurtful-word prompt (nothing sent until confirmed), read pointer, older pages, a gone conversation | as listed | jest + RNTL | pass |
| MOB-8 | mobile | unit | realtime client: ticket per connection, catch-up on `ready` and `resync`, hints passed on, backoff growth and cap, reset on `ready`, 4401 stops and signs out, 4429 waits 60 s, silence replaces the connection, failed ticket retried, stop; URL scheme | as listed | jest (fake sockets and timers) | pass |
| MOB-9 | mobile | screen | matches list: last message, "2 new · Your turn", the waiting notice, India date, opens the chat; the your-turn error on Like; a realtime hint refreshes an open chat | as listed | jest + RNTL | pass |
| E2E-3 | e2e | journey | two people in two browsers: sign up, introduction, like, like back, match; chat both ways with no reload (the matches list and the open chat update live); the hurtful-word prompt; the money tip for the recipient only; axe on the chat, the prompt and the list | as listed; no console errors or 5xx | Playwright + axe | pass |
| SAF-B1 | safety | negative | after a block, each path both ways: discovery, profile, media, a new like, likes received, matches, the match, send, history, read; realtime | 404 or absent everywhere; both get `match.closed` (no reason); nothing else announced; picks removed | api + real ws; mutation (no staff check) n/a | pass |
| SAF-B2 | safety | edge | block an unknown ID, yourself, twice; list blocks; unblock | 204 (nothing stored), 422, idempotent; only the blocker sees the list; the match stays ended | api | pass |
| SAF-U1 | safety | happy | unmatch by either person; a stranger; twice | 204 and `match.closed`; 404; 404; both lose the chat | api + real ws | pass |
| SAF-P1 | safety | happy | report a message (blocks by default); my reports; the reported person's list | the copy kept after the messages are deleted; status open; empty | api | pass |
| SAF-P2 | safety | negative | report without blocking; a photo; a stranger; yourself; my own message; an unknown message; not their photo; both items; long details; a bad reason; after a block; the daily limit | 201, 201, 404, 422 x6, 201, 429 on the 21st attempt | api | pass |
| SAF-R1 | safety | concurrency | a send arrives while a block holds the match row lock and closes the match | the send waits, then 404; nothing stored; without the send lock it is stored (mutation caught) | committed DB + mutation | pass |
| MODR-Q1 | admin | happy | the queue and a report's detail | underage first; opening puts it in review and assigns it; the reporter sees "in review"; no email, birthdate or location in the detail | api | pass |
| MODR-A1 | admin | happy | suspend from a report; act again | realtime closed 4401, sessions revoked; 409; report actioned; one append-only record; audited | api + real ws | pass |
| MODR-R2 | admin | happy | remove a message; remove a photo; remove with nothing to remove | shown as removed to both (text withheld, preview empty); the photo rejected and unreachable; 409 | api | pass |
| MODR-S1 | admin | negative | act on yourself; a moderator on another moderator; a missing account; no note; reports about yourself or about staff | 409, 403, 409, 422; 403 own_account, 403 admin_only, admin 200 | api | pass |
| MODR-B1 | admin | happy | ban (admin), reinstate, reinstate again; the audit log | matches closed (moderation), signed out; active again, the match stays ended; 409; entries with codes only | api | pass |
| MODR-P1 | admin | happy | photo review: pending oldest first with signed URLs; approve makes the profile ready; reject; unknown; your own photo | as listed; 404; 409 | api | pass |
| MOB-10 | mobile | screen | safety: Unmatch and Block ask first (cancel sends nothing), Report opens the form; the form needs a reason, offers their latest messages newest first without removed ones, blocks by default, can opt out, maps errors; the Safety screen lists blocks with unblock and report statuses; a removed message reads as removed; `match.closed` ends an open chat | as listed | jest + RNTL | pass |
| E2E-4 | e2e | journey | in the two-person spec: Meera reports Kabir's money message (scam, block on); his open chat closes live; her Safety screen shows the block and "Received"; axe on the report and Safety screens | as listed | Playwright + axe | pass |
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
| F05-H1 | chat | happy | send, receive, paginate, read | ordered history; unread counts correct | api | pass |
| F05-E1 | chat | edge | resend with the same `client_message_id`; double tap | one stored message | api | pass (MSG-C1 for concurrent taps) |
| F05-E2 | chat | edge | drop the WebSocket, send meanwhile, reconnect | REST catch-up; nothing lost or duplicated | api + ws | pass (RT-3) |
| F05-N1 | chat | negative | a non-participant reads or sends; a stale (unmatched) match; a blocked pair | all refused | api | pass (MSG-N1, MSG-N2) |
| F05-N2 | chat | negative | reuse or expire a realtime ticket | connection refused | ws | pass (RT-2) |
| F06-H1 | safety | happy | block, then probe every path (discovery, profile, media, likes, matches, messages, realtime) | invisible and unreachable on each path | api | pass (SAF-B1) |
| F06-H2 | safety | happy | report a message | reporter sees the status; it appears in the moderation queue | api | pass (SAF-P1, MODR-Q1) |
| F07-H1 | pause | happy | pause discovery | absent from other sets; existing chats keep working | api | planned |
| F09-H1 | delete | happy | delete the account and run the purge job | hidden at once; sessions revoked; data purged; listed exceptions retained | api + job | pass (PRIV-D2, PRIV-P1) |
| MOB-11 | mobile | screen | deletion: the screen states what happens, kept and unreachable; the password is required locally; a wrong password maps to the app's words; success forgets the session (keystore cleared) and the welcome screen shows the India date; sign-in on a scheduled account shows the date and Keep my account restores with the same credentials; the date is dropped once past; the entry point exists without a profile; Privacy explains visibility and pause and links to deletion | as listed | jest + RNTL | pass |
| E2E-5 | e2e | journey | a member without a profile deletes the account (password errors first), sees the date on the welcome screen, signs in, keeps the account, deletes it again; axe on the delete, welcome and sign-in screens | as listed; realtime closes 4401 at the request | Playwright + axe | pass |
| BIL-1 | billing | guard | live keys without `PAYMENTS_LIVE`; the Razorpay backend without its secrets | the server refuses to start | unit | pass |
| BIL-2 | billing | negative | payments not set up: checkout 503; webhooks refused | as listed | api | pass |
| BIL-3 | billing | happy | checkout, then activated: entitled and renewing; a second checkout 409; a duplicate event and a late event change nothing; cancel stops renewal once and keeps what was paid; cancelled after the period: not entitled; cancel again 409 | as listed (mutation: no stale check caught) | api | pass |
| BIL-4 | billing | edge | a failed renewal (pending) keeps the paid period; halted after it ends: not entitled | as listed | api | pass |
| BIL-5 | billing | security | signature: valid, another secret, missing, no event ID, the same JSON re-spaced (raw bytes are what is signed), not a subscription event, not JSON | applied or unknown; 400s; ignored | api (mutation: no signature check caught) | pass |
| BIL-6 | billing | privacy | deleting the account cancels a live subscription at once | the provider is asked to cancel now | api + job | pass |
| BIL-7 | billing | retention | payment event IDs older than 90 days | forgotten by the sweep | api | pass |
| BIL-8 | billing | adapter | Razorpay: the documented URLs, Basic auth, bodies; signature checks; 429 and 5xx retried, 400 not | as listed | fake server | pass |
| NTF-1 | notifications | happy | register a phone: bad tokens and platforms refused; the same session updates; a token moves to the newest session; delete | as listed | api | pass |
| NTF-2 | notifications | happy | preferences default on, saved, all three fields required | as listed | api | pass |
| NTF-3 | notifications | privacy | a message pushes the other person once per 10 minutes; the push is "Haanji" / "You have a new message." / `{kind}` with no text, names or IDs; the ticket is kept | as listed (mutation: no throttle caught) | api + job | pass |
| NTF-4 | notifications | happy | a like and a match push the other person; a pass never does | as listed | api | pass |
| NTF-5 | notifications | negative | a kind switched off, or the session signed out: nothing sent | as listed (mutation: no session check caught) | api + job | pass |
| NTF-6 | notifications | edge | a dead token is dropped at once; receipts after 15 minutes drop dead tokens and checked tickets; tickets go after a day | as listed | api | pass |
| NTF-7 | notifications | edge | Redis down: the message is still sent, no push queued | 201 | api | pass |
| NTF-8 | notifications | happy | a warning: a notice only for that member, readable and markable once (404 for others), pushed even with every kind switched off | as listed | api + job | pass |
| NTF-9 | notifications | adapter | Expo: batches of 100, the access token sent only when set, tickets and receipts parsed, 429, 5xx and network errors retried, 400 not | as listed | fake server | pass |
| MOB-12 | mobile | screen | push: no EAS project means nothing asked; web unsupported; refused permission registers nothing; granted registers this session's token; a tap opens a list, never a person; settings save at once; notices shown in fixed words and marked read | as listed | jest + RNTL | pass |
| AUD-1 | security | inventory | every route needs a member or staff session except a fixed public list (health, sign-in steps, signed media, the ticketed socket); `/v1/admin` routes need staff sessions; staff sessions only there | as listed; removing a session dependency fails it (mutation-checked) | api | pass |
| E2E-7 | recovery | e2e | sign up, sign out, "Forgot your password?", the mailed code and a new password; the old password fails, the new one signs in; axe on both reset steps | as listed | Playwright + axe | pass |
| WEB-4 | web | e2e | an unknown address: 404, the CSP present, no blocked scripts or styles, axe | as listed (BUG-001) | Playwright + axe | pass |
| WEB-1 | web | e2e | the landing page: only built features, "not open yet", working name; CSP with a nonce and `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no `X-Powered-By`; axe; reflow at 320 px | as listed | Playwright + axe | pass |
| WEB-2 | web | e2e | the console: no cookie, a forged cookie, and a signed-out session's cookie all land on sign-in (server-side, 307); a wrong password keeps the email; enrolment with a token, the key and an otpauth link, the TOTP code, ten recovery codes; cookie flags HttpOnly, Secure, SameSite=Strict, Path=/, the challenge cookie gone; the queue, a report (dismissed with a note), photos, the audit log, staff (reset another person's authenticator, not your own); sign out revokes the session; axe on 9 screens; no console errors or 5xx | as listed | Playwright + axe | pass |
| WEB-3 | web | unit | `app/tokens.css` is generated from the current design tokens | equal | node:test | pass |
| STF-1 | staff | unit | TOTP against RFC 6238 vectors; the window (±1 step) and the replay rule; malformed codes; secrets encrypted with a fresh nonce, bound to their owner, refused if altered or under another key; recovery codes unique, case-insensitive | as listed | unit | pass |
| STF-2 | staff | negative | app sessions on the console (even a moderator's) and staff sessions on member routes and realtime tickets | 401 both ways; a demoted holder of a staff session: 403 `staff_only` | api | pass |
| STF-3 | staff | happy | password (wrong, unknown and member's right password answer alike), then without an authenticator a bad token and a code fail, an admin's token enrols, a wrong code fails, the right one opens a 12-hour session with 10 recovery codes; the challenge and the token work once; enrolling again: 409 | as listed; the stored secret isn't readable | api | pass |
| STF-4 | staff | negative | a code replayed in the same step; a recovery code reused; 5 wrong codes end a challenge; 10 a day lock even the right code | refused; 429 | api | pass |
| STF-5 | staff | session | 30 minutes idle ends it, activity keeps it; 12 hours end it however busy; logout ends it | 401 after each | api | pass |
| STF-6 | staff | admin | only another admin can issue a token (moderator 403, self 409, members and unknown 404); issuing resets the authenticator and ends the person's staff sessions; a newer token voids the older; tokens expire in 24 h; CLI and admin issues audited | as listed | api | pass |
| STF-7 | staff | privacy | logs during enrolment and sign-in | no secret, code, token, recovery code, password or email | api | pass |
| DS-1 | design | contrast | tokens in code equal `replica/design/tokens.json`; every listed pair passes AA (4.5:1 text, 3:1 UI); type, spacing, radius, targets and ring equal; the arithmetic checked on known values | as listed; `contrast.py`: 26 pairs, 0 failing | jest | pass |
| DS-2 | design | states | busy buttons keep their name, are busy and disabled; disabled buttons don't fire; fields have name, hint and error; chips: checked state, tick hidden from screen readers; checkbox state; error notices are the only alerts; iOS announces errors and not other notices; a card is one named button with no heading and a decorative photo; titles are level 1; labelled photos are images | as listed | jest + RNTL | pass |
| DS-3 | design | gallery | `/design` shows every colour role and component state; choices toggle | as listed | jest + RNTL | pass |
| E2E-6 | design | e2e | the gallery: axe; Tab reaches the first button, which shows a 2 px solid focus-colour ring only while focused; a focused field has a 2 px accent border and no browser ring; disabled and busy buttons announced; reflow at 320 px with nothing sticking out; a full screenshot | as listed | Playwright + axe | pass |
| PRIV-D1 | delete | negative | no session, empty body, wrong password (5 tries), then the limit | 401; 422; 403 `password_incorrect` each time, audited, nothing changes; 429 | api | pass |
| PRIV-D2 | delete | happy | request with a match, a pick and a like | 202 with `purge_after` = now + 7 days; own socket closes 4401; the other person gets `match.closed`; /v1/me 401; every session revoked; profile, photo, match, messages and likes received 404 or empty for others; picks gone; match reason `deleted`; audited | api + real uvicorn | pass |
| PRIV-D3 | delete | happy | sign in during the grace period; restore | 403 `deletion_scheduled` with the date; wrong password says nothing more (401 on both routes); restore signs in, status active, the old session stays ended; a retry just signs in | api | pass |
| PRIV-D4 | delete | edge | password reset while waiting | the reset works; sign-in then offers to keep the account | api + job | pass |
| PRIV-P1 | delete | happy | the purge after 7 days | nothing before; then the user, sessions, codes, consents, profile, prompts, photos, preferences, picks, likes both ways, match, both people's messages, read pointers and blocks both ways are gone; the files after the job runs, the other member's kept; reports keep the copy without the person; moderation records and the audit trail kept; the deleted-account record holds the consents, no email hash, 1 year | api + job | pass |
| PRIV-P2 | delete | negative | an open report about the account | purge waits; resolved: purged; still open: purged just after 7 + 30 days, the report stays in the queue without the person | api + job | pass |
| PRIV-P3 | delete | race | restore commits after the account was listed as due | the purge re-checks under the row lock and skips it | api | pass |
| PRIV-B1 | delete | happy | ban, then 90 days | purged with the email hash (not the email); the same email gets the usual sign-up answer and no code; after the record's year it can sign up; a reinstated account isn't purged | api + job | pass |
| PRIV-B2 | delete | edge | ban and reinstate an account waiting for deletion | goes back to waiting; purged without an email hash | api | pass |
| PRIV-S1 | retention | boundary | each sweep rule one step either side of its period | ended match 31 days: gone with messages and reads (29: kept; an open one: kept); picks 8 days gone (6 kept); sessions expired or revoked 31 days gone (29 kept); codes 25 h past expiry gone (23 h kept); unverified 8 days gone with consents (6 kept); report link 91 days removed (89 kept); report 731 days deleted (open kept); records past their year gone; audit and moderation rows 3 years + 1 day gone, 3 years - 1 day kept; counts audited; a second run does nothing and writes no audit row | api | pass |
| PRIV-W1 | jobs | happy | the real worker runs the purge, the sweep and the old-jobs task | the due account is purged, its file job runs in the same pass, the other member's files stay; every job succeeds | real worker | pass |
| PRIV-J1 | jobs | config | the schedule | three periodic tasks with their cron strings | unit | pass |
| PRIV-G1 | db | grants | `deleted_accounts` and the purge function | SELECT, INSERT, DELETE (no UPDATE); EXECUTE for the app role, not PUBLIC | migration test | pass |
| ADM-N1 | admin | negative | a member token calls `/v1/admin/*`; a moderator calls an admin-only route | refused | api | pass (mutation-checked) |
| ADM-H1 | admin | happy | a moderator actions a report | action applied; audit entry written | api | pass (MODR-A1) |
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
| 2026-11-05 | owner's laptop | `uv run pytest` (stage 10a); realtime tests 3 runs; mutations: no send lock, reusable tickets | 285 passed; 13/13 each run; both mutations caught |
| 2026-11-05 | same | `npm test` in `apps/mobile` with the regenerated API types | 49 passed (one cold run timed out 4 tests at 30 s; three reruns passed in 7 s) |
| 2026-11-05 | GitHub Actions api run 41938343026 and mobile run 41938342940 on `b656d5c` (stage 10a) | both workflows | passed (285 API tests on Ubuntu; mobile checks and e2e) |
| 2026-11-05 | owner's laptop | `npm test` in `apps/mobile` (stage 10b); e2e 3 runs on a fresh database | 79 passed; both specs passed each run (chat 25-26 s) |
| 2026-11-05 | GitHub Actions api run 41941301362 and mobile run 41941301558 on `02592ff` (stage 10b) | both workflows | passed (285 API tests; 79 mobile tests; both e2e specs incl. the two-person chat) |
| 2026-11-05 | owner's laptop | `uv run pytest` (stage 11a); mutations: no send lock, no staff check | 298 passed; both mutations caught |
| 2026-11-05 | same | mobile tests and e2e with the regenerated types | 79 passed; both specs passed |
| 2026-11-05 | GitHub Actions api run 41947439992 and mobile run 41947439991 on `6f1538e` (stage 11a) | both workflows | passed (298 API tests) |
| 2026-11-05 | owner's laptop | `npm test` in `apps/mobile` (stage 11b); e2e 2 runs | 86 passed; both specs passed each run |
| 2026-11-05 | GitHub Actions mobile run 41948585270 on `6d3a449` (stage 11b) | mobile checks | **failed**: one auth screen test hit Jest's 5 s timeout on a cold cache (not a wrong result); fixed by a 30 s timeout, reproduced and verified locally from a cleared cache (86 passed) |
| 2026-11-05 | GitHub Actions mobile run 41949229426 on `4541c9f` (stage 11b) | mobile checks and e2e | passed (86 mobile tests; both e2e specs incl. the report flow) |
| 2026-11-05 | owner's laptop | `pytest` in `apps/api` (stage 12a) | 310 passed; mutation checks: no report hold, no barred-email check, no session revocation, no re-check under the lock: each caught |
| 2026-11-05 | GitHub Actions api run 41968944533 and mobile run 41968944600 on `3bb2532` (stage 12a) | both workflows | passed (310 API tests) |
| 2026-11-05 | owner's laptop | `npm test` in `apps/mobile` (stage 12b); e2e 2 runs | 89 passed; all three specs passed each run |
| 2026-11-05 | GitHub Actions mobile run 41969979059 on `f56b5fb` (stage 12b) | checks and e2e | passed |
| 2026-11-05 | owner's laptop | stage 13: `contrast.py`; `npm test` in `apps/mobile`; e2e 2 runs | 26 pairs, 0 failing AA; 103 passed; all four specs passed each run |
| 2026-11-05 | GitHub Actions mobile run 41974905121 on `b2332e7` (stage 13) | checks and e2e | passed |
| 2026-11-05 | owner's laptop | `pytest` in `apps/api` (stage 14a); CLI against the dev database | 319 passed; mutation checks (no replay check, no session separation, no enrolment token, no idle timeout) each caught; the CLI issues a token for staff and refuses members and unknown emails |
| 2026-11-05 | GitHub Actions api run 41977719453 and mobile run 41977719394 on `9161621` (stage 14a, after a format fix; run 41977235463 on `404f919` failed the format check before any test) | both workflows | passed (319 API tests) |
| 2026-11-05 | owner's laptop | stage 14b: `pytest`; `npm test -w @datingapp/web`; `next build`; e2e 2 runs | 319 passed; 2 passed; built (every page dynamic); all six specs passed each run |
| 2026-11-05 | GitHub Actions api run 41981021674 and mobile run 41981021743 on `f659d72` (stage 14b) | both workflows (web checks, build and six e2e specs) | passed |
| 2026-11-05 | owner's laptop | stage 15 audit, every level: API ruff, format, mypy, `pytest` (incl. migrations round trip and the route inventory); pip-audit; mobile typecheck, jest, web export; web tests, build, typecheck; npm audit (high); contrast; parity; e2e 2 runs | 320 passed; no known vulnerabilities; 103 passed; exported; 2 passed, built, clean; 0 high or critical (24 dev-tool advisories); 26 pairs, 0 failing AA; parity 74.1 (17 of 20 must-haves); all eight specs passed each run. BUG-001 (S4) found and fixed |
| 2026-11-05 | GitHub Actions api run 41985853625 and mobile run 41985853301 on `28b42b7` (stage 15) | both workflows (320 API tests, eight e2e tests) | passed |
| 2026-11-05 | owner's laptop | stage 16a: `pytest`; `npm test` in `apps/mobile`; onboarding e2e (now with Notifications) | 330 passed; mutation checks (no session check, no throttle) caught; 110 passed; passed |
| 2026-11-05 | GitHub Actions api run 42004360276 and mobile run 42004360275 on `f962695` (stage 16a) | both workflows | passed |
| 2026-11-05 | owner's laptop | stage 16b: `pytest`; pip-audit | 338 passed; mutation checks (no signature check, no stale check) caught; no known vulnerabilities |
| 2026-11-05 | GitHub Actions api run 42007106214 and mobile run 42007106643 on `25b9b0f` (stage 16b) | both workflows | passed |
