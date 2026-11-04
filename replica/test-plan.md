# Test plan

Build: `apps/api` stage 5 foundation  Date: 2026-11-04  Env: owner's Windows 11 laptop (local PostgreSQL 17.5, Redis 7.0.15 in WSL2) and GitHub Actions (Ubuntu, `postgres:17`, `redis:7`)

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
| SEC-1 | logging | negative | capture logs through every flow | no message bodies, emails, birthdates, codes or tokens | api | partial: stage 5 paths pass (FND-L1); rerun as each flow lands |
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

CI results are recorded in `progress.md` once the workflow has run on GitHub.
