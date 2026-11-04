# Progress

Updated: 2026-11-04

## Current phase

Stage 5 (API foundation) **implemented and tested locally**. CI: first run
pending. Next: stage 6 (auth).

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |
| — | Owner decisions recorded; histories merged (D030); Replica skills vendored (D031); standing rules in `CLAUDE.md` | `decision-log.md`, `.claude/skills/`, `CLAUDE.md` |
| 5 | FastAPI app factory, settings, async SQLAlchemy, RFC 9457 errors, request IDs, privacy-safe logs, body limit, `/healthz`, `/readyz`, OpenAPI at `/v1/openapi.json`; Alembic baseline (4 tables, owner and runtime roles); dev seed; CI workflow; 69 tests | `apps/api/`, `.github/workflows/api.yml` |

## Stage 5 status

- **Implemented and tested:** everything in the stage 5 brief (cases FND-* in `test-plan.md`); procrastinate confirmed on Python 3.13 (D035).
- **Not yet verified:** the CI workflow on GitHub.
- **Not in scope yet:** any user-facing feature. Parity is 0 of 20 must-haves (`parity.py`).
- **Known gap:** OpenAPI still documents FastAPI's default 422 schema rather than our problem format. Fix with the first body route (stage 6).

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
2. Before stage 6 can send real email: an email provider account plus SPF, DKIM and DMARC. Not blocking: stage 6 starts with the console and in-memory fakes.

## Next

Stage 6: auth. Age gate ("age declared"), email registration with a code, login, sessions, logout, recovery, `consents`, Redis rate limits, `EmailSender` and `SmsSender` abstractions, procrastinate schema and `send_email`.
