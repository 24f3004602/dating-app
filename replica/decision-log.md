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
| D009 | 2026-11-04 | **A:** Launch in India, Delhi NCR first. | Liquidity needs one dense city; Indian demand for intentional dating [14][21]; owner's base and payments plan. | Bengaluru first; all-India. | provisional |
| D010 | 2026-11-04 | **A:** Primary audience is serious daters aged 22-34; design for women's comfort first. | Women are about 26% of Indian dating-app users and are overwhelmed (H4). | Broad 18+ launch. | provisional |
| D011 | 2026-11-04 | Positioning: angle A (intent-first), with B (safe by default) and C (priced fairly) as product rules. | Strongest switching reason; market moving toward intent [14][16]. | Lead with safety alone (already table stakes). | provisional |
| D012 | 2026-11-04 | MVP sign-up uses email plus a one-time code. SMS sits behind an abstraction and is enabled after India DLT registration. | Owner spec; SMS in India needs sender and template registration. | Phone-first now. | provisional |
| D013 | 2026-11-04 | MVP chat is text-only; images in chat are deferred. | Avoids explicit-image harm until blur and moderation exist (H1, [7]). | Images with blur in MVP. | provisional |
| D014 | 2026-11-04 | Discovery shows a finite daily set (about 15) with deterministic, explainable ranking and an equal daily like limit for everyone. | Burnout and imbalance (H3, H4); simple and testable. | Endless deck; ML ranking. | provisional |
| D015 | 2026-11-04 | No paid visibility at launch. Later there is one paid plan with one published price per market, the same for every user. | Billing trust (H5); fairness (H7). | Tiered plans; boosts. | provisional |
| D016 | 2026-11-04 | Verification labels show only checks actually performed. An age gate is labelled "age declared", never "verified". | Owner principle; honesty. | — | active |
| D017 | 2026-11-04 | Other users see city-level location and a distance bucket only, never coordinates or an exact distance. | Owner spec: no precise location or location inference. | Exact distance (common elsewhere). | active |
| D018 | 2026-11-04 | Provisional names: Haanji (working), Vaada, Kinaara. | Survived web screening; legal checks still to run (`brand.md`). | Meant, Haan, Asli, Ishara, Dilwise (rejected). | provisional |
| D019 | 2026-11-04 | Code uses neutral identifiers; the brand name is configuration. | Renaming later costs nothing. | Brand-named packages. | active |
