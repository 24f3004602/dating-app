# dating-app (working title)

An original dating app for adults (18+): a mobile app (Expo / React Native), a
web landing page and admin console (Next.js), and an API (FastAPI + PostgreSQL).
It takes inspiration from the general functionality of mainstream dating apps;
it copies none of their code, branding, copy, assets or private APIs.

**Status:** stage 5 of 17. The API foundation exists (`apps/api`); no user
features yet. Current state and next step:
[`replica/progress.md`](replica/progress.md).

## Project documents (`replica/`)

| file | what it holds |
| --- | --- |
| [`progress.md`](replica/progress.md) | current phase, completed work, blockers, next task |
| [`decision-log.md`](replica/decision-log.md) | decisions and assumptions, with reasons |
| [`features.csv`](replica/features.csv) | feature matrix: priority and build status |
| [`recon.md`](replica/recon.md) | competitor research, with sources and dates |
| [`feedback.md`](replica/feedback.md) | what users struggle with, ranked by evidence |
| [`fixes.md`](replica/fixes.md) | audience, launch market, positioning, MVP scope, success criteria |
| [`brand.md`](replica/brand.md) | provisional names and the checks still to run |
| [`launch/pricing.md`](replica/launch/pricing.md) | pricing principles and hypotheses |
| [`architecture.md`](replica/architecture.md) | stack, modules, data model, API, build order |
| [`security-threat-model.md`](replica/security-threat-model.md) | threats, planned mitigations, residual risks |
| [`privacy-data-inventory.md`](replica/privacy-data-inventory.md) | what data we hold, why, who sees it, retention, deletion |
| [`test-plan.md`](replica/test-plan.md) | test strategy, cases and results |

The layout follows the conventions of the open-source
[Replica skill pack](https://github.com/Jakeschincariol/replica-skill) (MIT).
Files appear here as each stage produces them.

## Development: API (`apps/api`)

Needs Python 3.13, [uv](https://docs.astral.sh/uv/), PostgreSQL 17 and Redis 7.

```bash
cd apps/api
cp .env.example .env            # then fill in local values (never commit .env)
uv sync
uv run python scripts/bootstrap_db.py   # roles + dev database (needs BOOTSTRAP_ADMIN_URL)
uv run alembic upgrade head
uv run datingapp-api seed-dev           # labelled fixtures only, never in production
uv run datingapp-api serve              # http://127.0.0.1:8000/healthz, /v1/docs
uv run pytest                           # creates and drops <database>_test
uv run ruff check . && uv run mypy
```

`DATABASE_URL` is the runtime role (DML only) and `MIGRATIONS_DATABASE_URL`
the schema owner (D036). On Windows, Redis runs in WSL2: use `127.0.0.1`, not
`localhost` (D034). CI: `.github/workflows/api.yml`.
