# Decision log

Newest last. Status: `active`, `provisional` (needs owner sign-off) or `superseded`.
Assumptions are marked **A**.

| ID | date | decision | why | alternatives considered | status |
| --- | --- | --- | --- | --- | --- |
| D001 | 2026-11-04 | Keep project docs in `replica/`, following Replica conventions (`recon.md`, `features.csv`, `architecture.md`, `test-plan.md`, `bugs.md`, `fixes.md`, `brand.md`, `launch/`), plus four project-specific docs Replica lacks: `progress.md`, `decision-log.md`, `security-threat-model.md`, `privacy-data-inventory.md`. | Owner spec asks to adapt to Replica and avoid duplicates. | Separate `docs/` tree. | active |
| D002 | 2026-11-04 | Use Replica's `replica/bugs.md` instead of `bug-report.md`. | Same artifact under Replica's name; avoids two bug logs. | Keep `bug-report.md`. | active |
| D003 | 2026-11-04 | Follow Replica skills by reading their `SKILL.md` from the official repo (commit `77c9436`, v1.0.0) rather than installing them. | Not installed in this session; installing (vendoring into `.claude/skills/`) awaits owner OK. | Vendor now; Claude Code plugin install. | provisional |
| D004 | 2026-11-04 | Complaint research is paraphrased and linked, with sample sizes stated. No verbatim review corpus (`reviews.csv`), so `reviews.py` is not used. | Replica asks for verbatim quotes; republishing third-party review text in a public repo is a copyright risk. | Verbatim `reviews.csv`. | active |
| D005 | 2026-11-04 | REA is not used for competitor research. | Replica recon forbids decompiling a target or reading its bundles; REA's own disclaimer limits use to software we own or are authorized to examine; no authorized target exists. Revisit for pre-release audits of our own builds. | — | active |
| D006 | 2026-11-04 | Commit locally; do not push while the GitHub repo is public until the owner decides visibility. | Pushing to a public repo publishes the work. | Push now. | provisional |
| D007 | 2026-11-04 | Never commit screenshots of other apps (`replica/screens/` etc. are gitignored). | They are copyrighted reference material; the repo is public. | — | active |
| D008 | 2026-11-04 | Build on the owner's two existing GitHub commits (fast-forward), never rewrite history. | Preserve existing work; no force pushes. | New root commit. | active |
