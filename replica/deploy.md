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

## Run it at home first (D097)

The owner's choice (2026-11-05): run the closed beta on their own computer first, and move to a server (below) when the load grows.
- **The same stack** as on a server, plus `compose.tunnel.yaml`.
- **A Cloudflare Tunnel:**
  - `cloudflared` connects out to Cloudflare, so nothing is opened on the computer or the router (home connections often have no public address anyway);
  - Cloudflare provides HTTPS and passes requests to Caddy over the private network.
- **Visitor addresses:** Caddy believes `X-Forwarded-For` only from the tunnel's fixed address (172.30.0.250). Per-IP limits use the visitor's address and can't be faked (the `home-mode` CI job checks both).
- **The notice:** in home mode the privacy notice says the server is the operator's own computer, and names Cloudflare (`BETA_HOSTING=home`).
- **Not deployed:** these steps need your accounts and your go.

**The computer:** this laptop works for a small test: a Ryzen 3 7320U and 8 GB, checked 2026-11-05. It must stay on, awake and online while testers use the app.
- **Power (Windows Settings):**
  - keep it plugged in;
  - Power: never sleep when plugged in;
  - lid closing: "Do nothing" when plugged in.
- **Docker Desktop:**
  - start it;
  - Settings → General: "Start Docker Desktop when you sign in".

  After a Windows update restart, sign in, so the app comes back.
- **Protect the testers' data:**
  - a password on your Windows account;
  - Settings → Privacy & security → **Device encryption** on, if your laptop offers it;
  - don't share the account.
- **Memory:** 8 GB is tight. Keep heavy programs closed while testers are active.

**1. Domain and Cloudflare (owner):**
1. Buy the domain. UPI or a debit card works at most Indian registrars.
2. Create a free account at dash.cloudflare.com, then **Add a domain** → Free plan.
3. Cloudflare shows two nameservers. Set them at your registrar in place of theirs, then wait until Cloudflare says **Active**.
4. SSL/TLS → Edge Certificates → turn on **Always Use HTTPS**.
5. Create the tunnel: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, named `datingapp-beta`.
   - On the install page choose Docker, and copy **only the token** (the long value after `--token`).
   - Free-plan sign-up may ask for a payment method and not charge it. Try your SBI Visa debit card. If none is accepted, tell me: tunnels can also be made from the command line.
6. Add the tunnel's three **public hostnames**. Each has type HTTP and service `edge:80`:
   - `<domain>`;
   - `api.<domain>`;
   - `app.<domain>`.

   Cloudflare creates the DNS records.

**2. Start it** (Git Bash, in the project folder):
```sh
cd ~/desktop/dating-app/infra/beta
./make-env.sh <domain> <your-email>
notepad .env
#   fill in OPERATOR_NAME, CONTACT_EMAIL, SMTP_USERNAME (the Gmail address) and SMTP_PASSWORD (its app password),
#   and add two lines:
#     TUNNEL_TOKEN=<the token>
#     COMPOSE_FILE=compose.yaml;compose.tunnel.yaml
docker compose build              # the first build takes a while
docker compose run --rm migrate
docker compose up -d && docker compose ps
```
- **Check:**
  - Cloudflare shows the tunnel **Healthy**;
  - `https://app.<domain>` opens the app;
  - `https://<domain>/privacy` shows your name, your contact and the Cloudflare wording;
  - `https://api.<domain>/readyz` answers.
- **The token and `.env`** stay on this computer. Never send them in chat.

**3. Then, as on a server:** follow steps 4–7 below (first admin, testers, running it day to day, the APK). Two things differ for backups:
- Run `BACKUP_DIR="$HOME/datingapp-backups" ./backup.sh` daily, by hand or from Windows Task Scheduler.
- Copy the backups weekly to a drive kept somewhere safe: one computer is one point of failure.

**Moving to a server later:**
1. Set up the server (steps 1–2 below) and clone the repo.
2. Copy `.env` across securely, without the two home lines. It holds the database passwords and the app key; the invites and staff authenticators depend on that key.
3. Restore the latest backup (step 6 below).
4. In Cloudflare DNS, point `@`, `api` and `app` at the server's IP as **DNS only** (grey cloud), so Caddy gets its own certificates. Delete the tunnel.
5. The notice switches to the server wording by itself. Tell the testers where their data now lives.

## Closed beta on one server (stage 18, D096)

A small, invite-only user test before any launch. The owner's choices (2026-11-05):
- one Amazon Lightsail server in Mumbai;
- testers use a web link, plus an Android app file (APK);
- Gmail sends the codes.

The kit is in `infra/beta`, and the `beta-stack` workflow starts it exactly as below on every change. **Not deployed:** the steps marked (owner) need your accounts and your go.

**What runs:** one server, Docker Compose.
- **Caddy** (`edge`): the only thing reachable from the internet (80 and 443, with HTTPS from Let's Encrypt). It also serves the app's web build.
- **PostgreSQL, Redis, the API, the worker and the website:** all on a private network.
- **Photos:** on a volume on the server's disk.
- **Hosts:**
  - `app.<domain>`: the app, for testers;
  - `api.<domain>`: the API;
  - `<domain>`: the tester notice and the staff console.

**Cost (check current prices):**
- **Lightsail:** the 2 GB plan is US$12 a month with a public IPv4 address, and new accounts get 3 months free on that plan (AWS docs, checked 2026-11-05). The static IP is free while attached.
- **Free:** Gmail and the Expo free tier.
- **The domain:** the registrar's price.

**1. The server (owner).**
1. In Lightsail, create an instance:
   - Region: **Mumbai**;
   - Linux, "OS Only": **Ubuntu 24.04 LTS** (or 26.04 LTS);
   - Plan: **2 GB**;
   - Name: `datingapp-beta`.
2. Networking:
   - Create a **static IP** and attach it.
   - In the firewall, keep only SSH 22 (restricted to your own IP if you can), HTTP 80 and HTTPS 443, for both IPv4 and IPv6.
3. At your domain's registrar, add three **A records**: `@`, `api` and `app`, all pointing to the static IP. Check with `nslookup app.<domain>`.

**2. Software on the server** (SSH from the Lightsail page or your terminal):
```sh
sudo apt update && sudo apt -y upgrade
# Docker Engine from Docker's apt repository (docs.docker.com/engine/install/ubuntu, read 2026-11-05)
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # then sign out and back in
# 4 GB of swap: building the images needs more than 2 GB of memory
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**3. Start it:**
```sh
git clone https://github.com/24f3004602/dating-app.git && cd dating-app/infra/beta
./make-env.sh <domain> <your-email>   # generates the passwords and keys on the server
nano .env                              # OPERATOR_NAME, CONTACT_EMAIL, SMTP_USERNAME (the Gmail address), SMTP_PASSWORD (its app password)
docker compose build                   # the first build takes a while on 2 GB
docker compose run --rm migrate
docker compose up -d && docker compose ps
```
- **Check it:**
  - `https://app.<domain>` shows the app;
  - `https://<domain>/privacy` shows your name and contact;
  - `https://api.<domain>/readyz` answers.
- **Rules:**
  - `.env` never leaves the server.
  - Secrets never go in chat, email or the repo.

**4. You as the first admin:**
1. `docker compose exec api datingapp-api invite add <you@...>`.
2. Sign up in the app and enter the code.
3. Make yourself an admin: `docker compose exec postgres psql -U postgres -d datingapp -c "UPDATE users SET role = 'admin' WHERE email_normalized = '<you@...>';"`.
4. Get an enrolment token: `docker compose exec api datingapp-api staff-enrollment <you@...>`.
5. Go to `https://<domain>/admin/login`, scan the key with an authenticator app, and keep the 10 recovery codes offline.

**5. Testers:**
- Invite them: `docker compose exec api datingapp-api invite add a@example.com b@example.com`. The list holds keyed hashes only, so keep your own list of who you invited.
- `invite count` shows how many invites are open; `invite remove` takes one back.
- Send each tester:
  - the link `https://app.<domain>`, plus the APK link for Android;
  - "18+, use the address I invited, check spam for the code";
  - the notice links.
- **Discovery needs real overlap:** introductions only pair people whose gender, age, area and intentions fit both ways. Recruit enough testers in one area whose preferences match each other. There are never filler profiles (CLAUDE.md: never manufacture users).

**6. Running it day to day:**
- **Review photos and reports** in the console every day. Photos stay hidden until approved, so slow review means empty introductions.
- **Backups:** `crontab -e`, then add:
  - `30 21 * * * $HOME/dating-app/infra/beta/backup.sh >> $HOME/backup.log 2>&1`

  That runs 03:00 India time and keeps 7 days in `/var/backups/datingapp-beta`. Make the folder once: `sudo install -d -o $USER /var/backups/datingapp-beta`.
- **Health:** `docker compose ps`; `docker compose logs --tail 100 api worker`. Logs rotate at 3 × 10 MB per service.
- **Updates:** `git pull && docker compose build && docker compose run --rm migrate && docker compose up -d`.
- **Restore** a database backup into a fresh volume: `docker compose up -d postgres`, then `docker compose exec -T postgres pg_restore -U postgres -d datingapp --clean --if-exists < db-<time>.dump`. Photos: `docker compose exec -T api tar xzf - -C /app/var < media-<time>.tgz`.

**7. The Android app file (owner + me):**
1. Sign up at expo.dev.
2. In `apps/mobile`: `npx eas-cli login`, then `npx eas-cli init`. Put the project ID and your domain's URLs in `eas.json` (the `beta` profile refuses placeholders).
3. Build: `npx eas-cli build -p android --profile beta`. EAS gives an install link; testers allow "install unknown apps".
4. Push on Android is optional: it needs a Firebase project and `PUSH_BACKEND=expo`.

**8. When the test ends (the wipe):**
1. Tell the testers first.
2. On the server: `docker compose down -v`, which deletes the database, photos and certificates; then `sudo rm -rf /var/backups/datingapp-beta`.
3. Delete:
   - the Lightsail instance, any snapshots and the static IP;
   - the Gmail account's sent mail, or the whole account;
   - the EAS builds.
4. Record the date in `decision-log.md`.

The privacy notice promises all this within 30 days of the end.

**Limits of the beta, by design:**
- **One server:** no redundancy.
- **Backups:** on the same disk. Copy one off the server now and then, with `scp`.
- **Photos:** on disk; the bucket comes at launch.
- **Documents:** the notice hasn't had legal review.
- **Email:** Gmail's sending limits apply.
- **Staff sign-in limits:** the console's server doesn't pass the visitor's IP to the API, so per-IP limits on staff sign-in count all staff together. That's stricter, not weaker, but an attack on the console could lock staff out for a while.

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
