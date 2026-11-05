# Release readiness and staging plan

Date: 2026-11-05. Commit: `336321b` (stage 17). **Go from the owner: not yet.**
Nothing here has been deployed, bought or published. Everything under
"Staging plan" and "Runbooks" is **planned**. It needs the owner's
authorization and accounts (CLAUDE.md stage 17: no public deploy, spending or
store publishing without it). Template: replica-deploy `preflight.md`.

## Preflight (run 2026-11-05)

| check | result | evidence |
| --- | --- | --- |
| e2e suite green | **pass**: 8 of 8 tests in 6 specs, 2 local runs and CI | test-plan.md results; mobile CI runs |
| no open S1 or S2 bugs | **pass**: 0 open (BUG-001, S4, fixed) | bugs.md |
| parity: all must-haves done | **fail**: 17 of 20, score 74.1. The 3 missing all wait on owner setup: email registration and recovery (email provider), photos (private bucket) | `parity.py`; features.csv (D092) |
| rebrand sweep clean | **pass for shipped code**: `apps/mobile`, `apps/web`, `packages` and `e2e` exit 0. `apps/api`: 2 hits, both substrings of real breached passwords in the blocklist ("nothingelsematters", "whateveraisleofcox"), not brand use. The repo root: our instruction files (`CLAUDE.md`, the handoff), which never ship | `sweep.py --config replica/brand.json` |
| store listing passes | **not run**: no store listing yet (replica-launch); nothing goes to the stores without authorization | — |
| production builds pass | **pass**: web `next build` and the standalone server; Expo web export; container images built and smoke-tested in CI (`images.yml`) | images run 42012208962; api run 42012209136; mobile run 42012208614 |
| privacy policy and terms live, every processor listed | **fail**: drafts (`draft-2026-11`), refused in production by design (D044). The processors to list are in privacy-data-inventory.md | owner + lawyer |
| account deletion works | **pass**: request, 7-day restore, purge, retention (PRIV-*, E2E-5) | test-plan.md |
| favicon, titles, OG image, app icon are ours | **partial**: Expo's template icons replaced today with an original placeholder mark (two rings, our palette). The final logo waits for the brand and trademark check. No OG image: the site is `noindex` and not open | `apps/mobile/assets`, `apps/web/app/icon.png` |
| name cleared | **fail**: "Haanji" is a working name; trademark, domain and store checks still to run | brand.md |
| native device pass | **not done**: VoiceOver, TalkBack, large text, the keystore, the photo picker, realtime on mobile networks, push (NAT-1) | bugs.md "To check" |

**Verdict: not ready to launch.** No engineering defect blocks it. These do:

## Release gates

**Owner (accounts, decisions, spending):**
1. **Email provider:** for example Amazon SES in Mumbai, Postmark or Resend. A sending domain with SPF, DKIM and DMARC (records below). Then I add and test the adapter.
2. **A private storage bucket in an India region**, with an access key. Then I add and test the adapter with presigned GETs (D053).
3. **Final terms and privacy notice from a lawyer:**
   - list every processor (the inventory);
   - confirm the periods marked (R);
   - cover the grievance contact.
4. **The name:** trademark search (IP India, classes 9, 42, 45), domains, store names, handles. Then the logo.
5. **Hosting account** in an India region, and a budget (plan below).
6. **Expo and the stores:**
   - an EAS project;
   - an Apple Developer account and Play Console;
   - Firebase credentials (for push).
7. **Turn on Dependabot alerts and security updates** (repo settings).
8. **SMS:** only after DLT registration (D012). Not needed for launch.
9. **Payments:** the plan's contents and price, Razorpay KYC, store billing (D094). Not needed for the beta.

**Engineering, before or with staging:**
1. **The email adapter and the bucket adapter**, once their accounts exist (each with tests).
2. **The native device pass** (NAT-1), on a development build from EAS.
3. **A staging run of the whole journey** behind TLS, including Razorpay test webhooks if payments are wanted.
4. **Set `TRUSTED_PROXIES`** to the load balancer's and the console's addresses (OPS-1).
5. **PostgreSQL logging settings** (stage 6 note): `log_parameter_max_length_on_error = 0`, `log_statement = none`.

## Staging plan (planned)

**Shape:** one India region, everything private except the load balancer.

| part | what runs | notes |
| --- | --- | --- |
| load balancer | TLS 1.2+ (certificate from the provider), HTTP to HTTPS redirect, HSTS | the only public entry; forwards `X-Forwarded-For` |
| API | the `apps/api` image, 2 or more containers, `datingapp-api serve` | readiness: `/readyz` (database and Redis); liveness: `/healthz` |
| worker | the same image, 1 or more containers, `datingapp-api worker` | procrastinate: several workers are safe (each periodic tick is deferred once) |
| web | the `apps/web` image, 1 or more containers | calls the API privately (`API_URL`); `API_PUBLIC_URL` for photo links; one `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` shared across containers |
| PostgreSQL 17 | managed, private network, TLS, point-in-time backups for 30 days (R) | two roles: the owner runs migrations only; the runtime role runs the app (D036) |
| Redis 7 | managed, private network | rate limits and realtime fan-out; no persistence needed |
| object storage | a private bucket, no public access, presigned URLs only | adapter pending (gate 2) |
| secrets | the provider's secret manager, injected as environment variables | never in images or the repo; `.env.example` lists every name |

Candidates to price: AWS Mumbai (ap-south-1) and Google Cloud Mumbai (asia-south1). Both offer managed containers, PostgreSQL, Redis and object storage in India. Confirm current services and prices before choosing; any spending needs the owner's go.

**Hosts:**
- `example.in`: the landing page;
- `example.in/admin`: the console (same origin; `__Host-` cookies);
- `api.example.in`: the API.

The app's `EXPO_PUBLIC_API_URL` points at the API. CORS lists only an Expo web origin, if one is ever hosted (https only in production).

**Configuration (production refuses unsafe values, app/config.py):**
- `APP_ENV=production` (the image's default);
- a real email backend, a private bucket, final legal versions;
- no DEBUG logs, no test password-hashing profile;
- no memory push or fake payments backends;
- https CORS origins only.

**A release, step by step:**
1. CI green: api, mobile, images.
2. A database snapshot.
3. Migrations, as a one-off container with the owner role: `alembic upgrade head`.
4. Roll the API, then the worker, then the web containers.
5. Watch readiness and the error rate.

**Rollback:**
- The previous image goes back.
- Migrations are reversible (CI runs the upgrade, downgrade, upgrade round trip). Prefer a forward fix; downgrade only when a migration is the cause and the data allows it.
- The snapshot is the last resort.

**Logs and monitoring:**
- **Logs:** JSON logs to the provider's log store, kept 1 year (security logs, privacy inventory), access restricted. They never hold message text, emails, tokens or codes (tested).
- **Uptime checks:** `/healthz`, `/readyz` and the landing page.
- **Alerts:**
  - 5xx rate;
  - readiness failures;
  - failed jobs (`procrastinate_jobs` with status `failed`);
  - queue age;
  - certificate expiry.
- **Error tracking** (Sentry or similar) only after a processor review and an inventory row.

**DNS (values from the providers):**

| record | name | value |
| --- | --- | --- |
| A / ALIAS | `@` | the load balancer |
| CNAME | `api` | the load balancer |
| TXT | `@` | SPF from the email provider, e.g. `v=spf1 include:<provider> -all` |
| CNAME or TXT | `<selector>._domainkey` | DKIM from the email provider |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.in`, then `quarantine` once reports are clean |

**Mobile:**
- EAS build profiles (development, preview, production) once the EAS project exists.
- The app's name is "Haanji (dev)" until the name is cleared.
- Builds go to TestFlight internal testing and Play internal testing only with authorization; no public release before the gates close.

## Runbooks (planned)

**First admin:**
1. Create the account through the normal sign-up.
2. Make it an admin in the database, as the owner role, in a reviewed one-off: `UPDATE users SET role = 'admin' WHERE email_normalized = '<email>';`
3. Run `datingapp-api staff-enrollment <email>` in a one-off API container.
4. Hand the token over in person.
5. The admin signs in at `/admin/login`, scans the key, and stores the 10 recovery codes offline.
6. Admins then reset each other from the Staff page (D090).

**Rotating secrets:**

| secret | how | effect |
| --- | --- | --- |
| database passwords | rotate in the secret manager, restart | none for members |
| `APP_SECRET_KEY` | only after a compromise | live codes and photo links stop working, rate limits reset, banned-email hashes become useless, and every staff member enrols again (new tokens from the CLI). Announce to staff first |
| Expo or Razorpay keys | rotate at the provider and in the secret manager | Razorpay: retried webhooks signed with the old secret fail (Razorpay docs); rotate when none are pending |

**Incident response:**
1. Name an incident lead.
2. Keep a timeline in a private document.
3. Contain the incident. The levers:
   - revoke a member's sessions (sign-out everywhere, or suspend from the console);
   - reset a staff member's authenticator, which ends their staff sessions;
   - turn off push (`PUSH_BACKEND=none`) or payments (`PAYMENTS_BACKEND=none`);
   - scale the web containers to zero to close the console.
4. Keep logs; don't delete evidence.
5. A post-incident review, with a regression test for the cause.

**Personal data breach** (DPDP Rules 2025, Rule 7, read from dpdprules.org's copy of the Gazette text, 2026-11-05; in force from 13 May 2027, followed from day one):
1. **Each affected member, without delay,** through their account or registered email:
   - what happened, when, and how much;
   - the likely consequences for them;
   - what we have done and are doing;
   - what they can do;
   - a contact who can answer.
2. **The Data Protection Board, without delay:** the nature, extent, timing, location and likely impact.
3. **The Board, within 72 hours** (or longer if the Board allows on a written request):
   - the details and the facts and reasons;
   - the mitigation;
   - any findings about who caused it;
   - the measures against recurrence;
   - a report on the notices to members.

There is no size threshold: every breach counts. A lawyer reviews the notices. Members can be reached through the app's notices (stage 16) and email.

**Backups:**
- Restore the latest backup into a scratch environment every quarter, and run the migration check and a smoke test against it.
- Deleted members' data leaves the backups as they age out (30 days, privacy inventory).

**Erasure requests by email** (suspended or banned members can't sign in): verify the requester controls the account's email, then an admin runs the deletion through a reviewed one-off. A console tool is a later addition.

## First week after launch (planned)

- **Daily:**
  - the error rate, failed jobs and the moderation queue age (underage reports first);
  - photo review backlog;
  - sign-up and verification email delivery.
- **The core journey** on the live site and on an Android and an iOS phone: sign up, profile, photos, introductions, like, match, chat, report, delete.
- **Accessibility spot checks** with TalkBack and VoiceOver.
