# Progress

Updated: 2026-11-04

## Current phase

Stage 6 (auth API) **implemented and tested locally** (141 tests); CI run
pending. Next: stage 7 (profiles, media, first Expo screens).

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |
| — | Owner decisions recorded; histories merged (D030); Replica skills vendored (D031); standing rules in `CLAUDE.md` | `decision-log.md`, `.claude/skills/`, `CLAUDE.md` |
| 5 | FastAPI app factory, settings, async SQLAlchemy, RFC 9457 errors, request IDs, privacy-safe logs, body limit, `/healthz`, `/readyz`, OpenAPI at `/v1/openapi.json`; Alembic baseline (4 tables, owner and runtime roles); dev seed; CI workflow; 69 tests. CI run 41823765056 passed | `apps/api/`, `.github/workflows/api.yml` |
| 6 | Auth API: register (age gate, NIST passwords, consents), verify email (code + password, D045), resend, login, logout, logout-all, password reset, `/v1/me` with honest labels; Redis rate limits (fail closed); lockout; procrastinate worker with transactional jobs; email, SMS and identity provider interfaces; migrations 0002-0003 | `apps/api/app/modules/auth/`, `app/providers/`, `app/jobs.py`, `app/ratelimit.py` |

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
4. SMS stays off until India DLT registration (entity, sender ID, templates) and an SMS provider exist (D012).

## Next

Stage 7: profiles and media API (areas, profiles, prompts, photos with safe processing and pre-moderation), then the Expo scaffold with auth and profile screens (first vertical slice).
