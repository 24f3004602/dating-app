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

Generated per user flow (F01, F02...) once flows and architecture exist.
IDs: `F01-H1` happy path, `F01-E1` edge case, `F01-N1` negative case.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |

## Results

No tests run yet: there is no application code.
