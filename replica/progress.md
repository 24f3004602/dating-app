# Progress

Updated: 2026-11-04

## Current phase

Planning complete (stages 1-4). **Waiting for owner agreement** before stage 5,
the first code. No application code exists.

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |

## Proposal (provisional)

- **Product:** serious daters aged 22-34 in India, launching in Delhi NCR. Intent-first: a finite daily set, an equal like limit, a cap on chats awaiting your reply. Safety is free and the default; pricing is fair. Names: Haanji (working), Vaada, Kinaara.
- **Architecture:**
  - Mobile: Expo SDK 58.
  - Web: Next.js 16 (landing page and admin console).
  - API: FastAPI modular monolith with SQLAlchemy 2.1 and Alembic.
  - Data: PostgreSQL 16; Redis for rate limits and realtime fan-out.
  - Storage and jobs: private object storage; a PostgreSQL-backed job queue.
- **Privacy and auth:** area-level location without GPS, opaque sessions.

## Environment (verified 2026-11-04)

- **Installed:** Node 22.23.4, Python 3.13.18, uv, PostgreSQL 16.15 and Redis 7.0.15 (installed, stopped), JDK 21, and Chrome 153 with Playwright (headless launch passed).
- **Not usable here:** Docker, PostGIS, an Android emulator, Expo cloud, and Playwright's browser download.
- **Tooling:** Replica is followed from its official repo (D003). REA is not used (D005).
- **Git:** 4 local commits on top of the owner's 2. **Nothing pushed**; the repo is public (D006).

## Blockers / decisions needed

1. Agree or adjust the product and architecture proposals (decisions marked `provisional`).
2. Repo visibility before the first push.
3. Vendor the Replica skills into `.claude/skills/`? (D003)

## Next

Stage 5: API foundation (D029 scope), once item 1 is agreed.
