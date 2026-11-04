# Test plan

Build: none yet (no application code)  Date: 2026-11-04  Env: cloud workspace, local services, seed data

## Strategy

| level | tool | where it runs | covers |
| --- | --- | --- | --- |
| unit | pytest (API); Jest (mobile, web) | workspace, CI | pure logic: eligibility filters, ranking, validation |
| API / integration | pytest + HTTP client against a real PostgreSQL 16 test database | workspace, CI | authorization, constraints, transactions, rate limits |
| concurrency | pytest with parallel sessions | workspace, CI | reciprocal likes create exactly one match; no duplicate messages |
| end-to-end (web) | Playwright driving the installed Chrome | workspace, CI | landing page, admin console, Expo web build of mobile flows |
| accessibility | axe scan inside Playwright specs | workspace, CI | every screen |
| native mobile | manual checklist on a real device | owner's device / CI builds | camera, photo picker, push, deep links |

Rules (from replica-test): one spec per flow; select by role and label, never
CSS classes; fail on console errors and on any 5xx; test our app only, never
load-test or script other apps' services.

Environment limits (2026-11-04): Playwright's browser download is blocked here,
so specs use the installed Chrome. There is no Android emulator in the
workspace, so native-only checks are manual.

## Cases

IDs: `F01-H1` happy path, `F01-E1` edge case, `F01-N1` negative case. Flows
are defined in `recon.md` and routes in `architecture.md`. These are
**planned**: each one gets a result when its stage is built.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | sign up | happy | register as an adult → code → verify | session issued; label reads "age declared, email verified" | api | planned |
| F01-N1 | sign up | negative | register with an under-18 birthdate | rejected; no user, email or code row stored | api | planned |
| F01-E1 | sign up | edge | resend or reset for unknown and known emails | identical status, body and timing class | api | planned |
| F01-N2 | sign up | negative | wrong code 5 times; expired code; reused code | locked, rejected, rejected | api | planned |
| F01-H2 | sessions | happy | login, logout, logout-all | revoked tokens are refused on every route | api | planned |
| F01-N3 | sessions | negative | password reset while other devices are signed in | every older session refused | api | planned |
| F01-N4 | abuse | negative | burst login, register and code requests | 429 with `Retry-After`; limits per account and IP | api | planned |
| F02-H1 | profile | happy | create and edit a profile without an intent, then with one | without: validation error; with: saved | api + e2e | planned |
| F02-N1 | photos | negative | upload a non-image, a polyglot, > 10 MB, > 40 MP, an animated image | each rejected with a clear problem code | api | planned |
| F02-E1 | photos | edge | upload a JPEG with GPS metadata | stored copies contain no metadata | api | planned |
| F02-N2 | photos | negative | another member fetches a pending photo | 404 | api | planned |
| F03-H1 | discovery | happy | build today's set for a seeded viewer | only eligible candidates; at most 15; stable all day | unit + api | planned |
| F03-E1 | discovery | edge | blocks in either direction; earlier like or pass; paused; hidden | all excluded | api | planned |
| F03-N1 | discovery | negative | inspect every discovery and profile response | no coordinates, exact distance, email or birthdate | api (schema) | planned |
| F03-N2 | discovery | negative | open a profile outside the set, matches or likes received | 404 | api | planned |
| F04-H1 | match | happy | A likes B, then B likes A | exactly one match | api | planned |
| F04-E1 | match | edge | A and B like each other simultaneously (parallel, 50 rounds) | exactly one match every round | concurrency | planned |
| F04-N1 | match | negative | like yourself, or a blocked, paused, ineligible or deleted user | rejected; no match | api | planned |
| F04-N2 | match | negative | exceed the daily like limit | 429 with code `like_limit` | api | planned |
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
| SEC-1 | logging | negative | capture logs through every flow | no message bodies, emails, birthdates, codes or tokens | api | planned |

## Results

No tests run yet: there is no application code.
