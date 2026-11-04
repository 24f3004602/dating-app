# Progress

Updated: 2026-11-04

## Current phase

Planning (stages 1-4). No application code. Stage 3 is complete and waits for
owner agreement.

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge: 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |

## Proposed product (provisional, needs owner agreement)

- **Who:** serious daters aged 22-34 in Indian metros. Launch city: Delhi NCR.
- **Angle:** intent-first, with fewer and better matches. Safety is free and the default; pricing is fair.
- **MVP:**
  - adult age gate and email sign-up
  - profile with a required intent and 2-6 photos
  - reciprocal filtering and a finite daily set
  - like and pass with an equal daily like limit
  - atomic matches
  - real-time text chat
  - block, report and moderation
  - pause and deletion
  - admin console
- **Deferred:** SMS sign-up, liveness or ID verification, images in chat, push notifications, the paid plan, AI, calls.
- **Names:** Haanji (working), Vaada, Kinaara. Trademark checks are still to run.
- **Feature matrix:** 49 rows, all with `clone = no` so far: must 25, should 11, could 13, of which 4 are skip. 7 rows are our own additions (`original = no`).

## Environment (verified 2026-11-04)

- **Workspace:** Ubuntu 24.04 cloud workspace, 2 vCPU, 7.8 GiB RAM.
- **Installed:** Node 22.23.4, Python 3.13.18, uv, PostgreSQL 16.15 and Redis 7.0.15 (installed, stopped), JDK 21, and Chrome 153 with Playwright 1.63 (headless launch passed).
- **Not usable here:** Docker (daemon off, Docker Hub blocked), PostGIS, an Android emulator, Expo cloud and Playwright's browser download (blocked by the proxy).
- **Tooling:** Replica is followed from its official repo, not installed (D003). REA is not used (D005).
- **GitHub:** pushes are possible only to this repo. Nothing has been pushed (D006).

## Blockers / decisions needed

1. Agree or adjust the stage 3 proposals (D009-D015, D018).
2. Repo visibility before the first push. The repo is public.
3. Whether to vendor the Replica skills into `.claude/skills/` (D003).

## Next

Stage 4: architecture and the staged implementation plan.
