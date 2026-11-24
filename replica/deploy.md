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
  - `https://<domain>/.well-known/security.txt` gives the same contact for security reports (D145), and `app.` and `api.` redirect there;
  - `https://api.<domain>/readyz` answers.
- **The token and `.env`** stay on this computer. Never send them in chat.

**3. Then, as on a server:** follow steps 4–7 below (first admin, testers, running it day to day, the APK). Two things differ for backups:
- Schedule it once: `powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-backup.ps1` (add `-NoRun` to skip the run it starts straight away). That runs `backup.sh` at 03:00 every day, or as soon as you're next signed in, through a headless console (no window to close by mistake; D142), keeps 7 days in `%USERPROFILE%\datingapp-backups` (always the newest 3 good ones), and logs to `backup.log` there. By hand: `BACKUP_DIR="$HOME/datingapp-backups" ./backup.sh` from Git Bash; add `BACKUP_PRUNE=no` to keep every older backup that time.
- Glance at `backup.log` now and then: a `backup:` line a day naming the tables and sizes. A failure is one line, `backup FAILED at <time> (<step>)`, and leaves no file that looks like a backup. `grep FAILED backup.log` finds them.
- After a release, and once a month, prove the newest backup restores: `./restore-check.sh "$HOME/datingapp-backups/<newest db-*.dump>"` (a throwaway database with no network; counts only).
- **The encrypted copy in Google Drive (D149):** one computer is one point of failure, so each backup also goes, encrypted, to the owner's Google Drive. Set up once: Google Drive for desktop, signed in (My Drive is `G:`); `sh infra/beta/backup-key.sh new "$HOME/kinaara-backup-key"` (the public key goes to `infra/beta/backup-key.asc`; the private key, its passphrase and a README go to that folder: save both in the password manager, check them, then delete the folder); and `BACKUP_COPY_DIR=G:/My Drive/Kinaara backups` in `.env`. Every backup then also writes `db-<time>.dump.gpg` and `media-<time>.tgz.gpg` there, kept 7 days (the newest 3 always), and logs `encrypted copy: ...`; a failure logs `backup FAILED at <time> (encrypted copy: <step>)` and the health check emails. Never put the private key on this laptop or in Drive: then whoever has either can't open the copies.
- **Check a copy, or the password manager's key:** `sh infra/beta/backup-key.sh check <private-key.asc> <passphrase file> "G:/My Drive/Kinaara backups/<file>.gpg" "$HOME/datingapp-backups/<file>"` opens it in a throwaway keyring, compares it and keeps nothing.
- **Restore from Drive** (the laptop lost): on any computer with GnuPG 2.2 or later (Git for Windows has it): save the password manager's key as `private-key.asc`; `gpg --import private-key.asc`; download the newest `db-*.dump.gpg` and `media-*.tgz.gpg` from drive.google.com (My Drive > Kinaara backups); `gpg --output db.dump --decrypt db-<time>.dump.gpg` (it asks for the passphrase) and the same for the photos; `./restore-check.sh db.dump`, then restore as below. Afterwards delete the decrypted files and `gpg --delete-secret-keys 23F9561070B40231235244510328467D2C8D38C6`.
- **Monthly image updates (D148):** schedule once: `powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-updates.ps1`. On the first Sunday at 04:00 `update-images.sh` pulls `postgres:17` and `redis:7`, and if either has a newer patch it backs up, restarts that service and the API and worker, and checks they're healthy; if not, it puts the old image back. `update.log` beside the backups; the health check emails on `update FAILED`. By hand: `./update-images.sh --check` says what would change.
- **Redis has a password** (`REDIS_PASSWORD` in `.env`, D147); restart `redis api worker` together whenever it changes. Check: `docker compose exec redis redis-cli ping` says PONG (it reads `REDISCLI_AUTH`), `docker compose exec redis sh -c 'env -u REDISCLI_AUTH redis-cli ping'` says NOAUTH, and `/readyz` shows `"redis":"ok"`.
- **Roll back a release** (rehearsed 2026-11-24: about a minute each way, only web and edge restarted): from `infra/beta`, `docker tag datingapp-web:rollback-<date> datingapp-web:beta && docker tag datingapp-edge:rollback-<date> datingapp-edge:beta`, then `docker compose up -d --no-deps web edge`; check `/readyz`, the site and the app. Forward again the same way from the tags of the release (tag them `current-<date>` before rolling back). An API rollback is the same with `datingapp-api` and `api worker`, but only when no migration ran (otherwise restore the backup: step 6).
- Keep the computer's disk encrypted (Windows: Settings > Privacy & security > Device encryption, or BitLocker): it holds the database, the photos, the backups and `.env`. On the beta's laptop it is on (the owner checked, 2026-11-23).
- **Health check (D143):** schedule it once: `powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-health.ps1`. Every hour, with no window, `health_check.py` checks that every service runs (and is healthy where it has a check), that `https://api.<domain>/readyz` answers, that the newest backup (and, with `BACKUP_COPY_DIR` set, the newest encrypted copy) is under 36 hours old, that no background job waits over 30 minutes, and that the last hour had fewer than 5 server errors and fewer than 50 failed member sign-ins, with 5 GB free; a new `backup FAILED` line, a new failed job or any failed staff sign-in is reported once. It emails `CONTACT_EMAIL` (or `ALERT_EMAIL`, if you add it to `.env`) through the beta's Gmail: when something starts failing, every 12 hours while it lasts, when it's clear again, and once a week when all is well. Its first run sends "The health check is on: all well". `health.log` beside the backups has a line an hour; `py -I infra/beta/health_check.py --dry-run` shows the checks without sending, and `--test` sends a test message. It can't tell you the laptop itself is off or offline: that needs a check from outside (an uptime service, a processor decision).
- **Outside uptime check (D146; the owner's account, not set up yet):** UptimeRobot's free plan (5-minute checks). Sign up at uptimerobot.com and add three HTTP(S) monitors, `https://kinaara.online/`, `https://app.kinaara.online/` and `https://api.kinaara.online/readyz`, alerting the owner's email. It covers what the health check can't: the laptop off, asleep or offline.
- **Cloudflare Access on the staff console (D146; the owner's clicks, not set up yet):** Cloudflare dashboard > Zero Trust (Free plan) > Access > Applications > Add an application > Self-hosted: name "Kinaara console", domain `kinaara.online`, path `admin*`; policy Allow, Include > Emails > the owner's; login method One-time PIN. Check from outside, in a private window: `https://kinaara.online/admin/login` asks for an email on a Cloudflare page first; `curl -sI https://kinaara.online/admin/login` answers a redirect, not 200. The console's own password, TOTP and staff session stay.

**The background video (D099):** the candlelight loop is served through Cloudflare by the owner's choice, although Cloudflare's CDN terms don't allow video from your own server on the free plan. If Cloudflare objects, or to save bandwidth, switch it off:
- **Website:** add `HERO_VIDEO=off` to the web service's environment in `compose.yaml`, then `docker compose up -d web`. The still stays.
- **App:** add `EXPO_PUBLIC_WELCOME_VIDEO=off` to the edge service's build args, then `docker compose build edge && docker compose up -d edge`.
- **CSP:** after changing `app-csp.txt`, rewrite `APP_CSP` in `.env` the way `make-env.sh` does.

**Updating the beta without building on the laptop (D118):** building the images needs more memory than the laptop can spare beside the running beta, so GitHub Actions builds them (Git Bash, in the project folder; `gh` signed in). Pick what goes live: `app` (the member app, the `edge` image), `website` (`web`), `api` (the API, worker and migrations) or `all`.
```sh
gh workflow run beta-images.yml -f images=app -f domain=<domain> -f brand_name=<name>   # add -f brand_name_devanagari=... if set
gh run list --workflow beta-images.yml --limit 1        # wait until it says completed, success
gh run download <run id> -D /tmp/beta-images            # one folder per image: edge-image, web-image, api-image
for d in /tmp/beta-images/*/; do (cd "$d" && sha256sum -c *.sha256); done
```
Then, for each image downloaded (`edge`, `web` or `api`), keep the running one and load the new one:
```sh
docker tag datingapp-edge:beta datingapp-edge:rollback-$(date +%Y%m%d)
gunzip -c /tmp/beta-images/edge-image/edge-image.tar.gz | docker load
```
and restart only what changed, from `infra/beta`:
- **App:** `docker compose up -d --no-deps edge`.
- **Website:** `docker compose up -d --no-deps web`.
- **API:** back up first (`BACKUP_DIR="$HOME/datingapp-backups" ./backup.sh`), then `docker compose run --rm --no-deps migrate` (the build log's "newest migration" says whether one is due; without `--no-deps`, compose also brings postgres up and recreates it if its settings changed, which restarted the database for a second on 2026-11-13), then `docker compose up -d --no-deps api worker`. A migration changes the database: rolling the API back past one needs that backup.
- **Check:** `https://app.<domain>`, `https://<domain>` and `https://api.<domain>/readyz` answer; the containers you didn't restart keep their uptime.
- **Roll back** an image: `docker tag datingapp-<image>:rollback-<date> datingapp-<image>:beta`, then the same `up -d --no-deps` line.
- Rebuild only what is meant to go live: the website's Devanagari copy still waits for a native speaker (progress.md).

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

  That runs 03:00 India time and keeps 7 days in `/var/backups/datingapp-beta` (always the newest 3 good ones). Make the folder once: `sudo install -d -o $USER /var/backups/datingapp-beta`. Failures log `backup FAILED at <time> (<step>)` and leave no partial file (D142); after each release, `./restore-check.sh /var/backups/datingapp-beta/<newest db-*.dump>`.
- **Health check:** add `0 * * * * python3 $HOME/dating-app/infra/beta/health_check.py >> $HOME/health-cron.log 2>&1` to the same crontab (D143; it reads `.env` beside it and writes its state beside the backups).
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
   - the EAS builds;
   - at home: the `Kinaara backups` folder in Google Drive, then Drive's trash (it keeps deleted files 30 days), and the password manager's "Kinaara backup key".
4. Record the date in `decision-log.md`.

The privacy notice promises all this within 30 days of the end.

**Limits of the beta, by design:**
- **One server:** no redundancy.
- **Backups:** on the same disk; at home an encrypted copy also goes to Google Drive (D149). On a server, point `BACKUP_COPY_DIR` at a mounted folder elsewhere, or copy one off now and then with `scp`.
- **Photos:** on disk; the bucket comes at launch.
- **Documents:** the notice hasn't had legal review.
- **Email:** Gmail's sending limits apply.
- **Staff sign-in limits:** the console's server doesn't pass the visitor's IP to the API, so per-IP limits on staff sign-in count all staff together. That's stricter, not weaker, but an attack on the console could lock staff out for a while.
### The Android app's release key (D154)

- **Where it is:** GitHub, the `android-release` environment (only `main` may use it): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`kinaara`); the repository variable `ANDROID_CERT_SHA256` is the certificate's public fingerprint, which every build checks. An encrypted copy (the keystore and a README with the password) is in Google Drive, `Kinaara keys/android-release-key-20261124.tar.gpg`.
- **If GitHub loses it:** open the Drive copy with the backup key from the password manager (`gpg --import` the key, then `gpg --decrypt` the file and `tar -xf`), then set the three secrets again (`gh secret set ... --env android-release`). Lose both and installed apps can never be updated: never delete the Drive copy.
- **A new APK:** run `android-apk` from `main` (Actions, Run workflow); tick `publish` to make it the latest release, which `kinaara.online/android` links to. The build stops if the APK isn't signed with this key.
- **Google sign-in on Android:** Google Cloud Console, APIs and Services, Credentials, an Android OAuth client with package `online.kinaara.app` and SHA-1 `28:DE:22:DB:7F:4C:D7:65:F5:DD:9A:08:87:BE:65:57:9C:78:43:99`.

### In-app ads (D137): switching them on

Built and off. Ads exist only in Android builds made with `ads` set to `test` or `live` in the
`android-apk` workflow; the web app never has them. In order:

1. **The documents:** `beta-2026-11-20` names ads in the privacy notice. Release it (the website,
   the API's compose and the app image together, as for every version) before any build with
   ads reaches testers, and tell existing testers first.
2. **Test ads on a phone:** run `android-apk` with `ads: test`: Google's test units ("Test Ad")
   under Google's test app ID. Install on the owner's phone only.
3. **The owner's accounts:** Google Play (the app public there: AdMob links only store-listed
   Android apps) and AdMob: add the Android app, link it to the Play listing, make a banner unit
   and an interstitial unit. Set AdMob's blocking controls (dating, matrimonial and adult
   categories; competitors' URLs). Put `app-ads.txt` with the publisher line AdMob shows on
   kinaara.online.
4. **A live build:** `android-apk` with `ads: live` and the app ID and both unit IDs (public IDs,
   not secrets). `app.config.ts` refuses a live build with missing or test IDs. Upload the
   release build to Play, not this debug-signed APK.

Plus members never see ads and their app never starts the SDK. To turn ads off, build with
`ads: off`.

### Live calls and the plan: switching them on (stage 23, D123, D124)

Live and the plan are built but off on the beta until these settings are in:
`CALLS_ICE=off` (Live says it isn't available) and `PAYMENTS_BACKEND=none` (the plan says
it isn't available). In order:

1. **The relay (owner):** in the Cloudflare dashboard (the account the tunnel uses), Realtime,
   TURN: create a TURN key; put its ID and API token in `infra/beta/.env` as
   `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`, with `CALLS_ICE=cloudflare`.
   Never `direct` on a server (the settings refuse it).
2. **The documents:** done in `beta-2026-11-19` (D128): Live and Plus in the privacy notice
   and the terms, released with the images below (the owner's go, no lawyer's review yet).
   The API (compose), the app's build (`app.Dockerfile`, eas.json, android-apk) and the
   website (`documents.ts`) carry the version together; release all three at once, or
   sign-ups fail on a version mismatch.
3. **Release:** the images through `beta-images` (all three: the API with migration 0015,
   the website, and the app, whose Caddyfile now allows the camera and microphone on
   `app.<domain>`); run `migrate` first (a backup before it), as for every migration.
4. **Check:** two phones or browsers on different networks: a call connects, and
   `chrome://webrtc-internals` shows only relay candidates. For the Android app, run the
   `android-apk` workflow by hand (Actions, android-apk, Run workflow, the beta's domain):
   it builds an APK with the beta's public settings (debug-signed, never published,
   kept 7 days); check the SHA-256 it prints, then install it with
   `adb install app-release.apk` and call a browser from it. Listen for the sound: if it
   comes from the earpiece, add the speaker fix D126 names.
5. **The Plus pass, paid by UPI (D127, the owner's choice):** in `infra/beta/.env`:
   ```
   PAYMENTS_BACKEND=upi
   PAYMENTS_LIVE=true
   UPI_PAYEE_VPA=<the UPI ID members pay; a business one works best>
   UPI_PAYEE_NAME=<the name on it, as UPI apps show it>
   PLUS_PRICE_INR=299
   PLUS_PASS_DAYS=30
   ```
   then `docker compose up -d --no-deps api worker`. **Each payment:** the console's
   Payments page (admins) lists references waiting; find each in the bank's app or
   statement, check the amount, then Approve (the pass starts) or Reject with why. Refunds
   go from the bank by hand, as the terms say. To stop selling: `PAYMENTS_BACKEND=none`.
**Sign-up is open (D133, 2026-11-19):** `SIGNUP_INVITE_ONLY` defaults to false in compose;
set it to `true` in `infra/beta/.env` (then `docker compose up -d --no-deps api worker`) to
go back to invites (`datingapp-api invite add <email>`). The website's buttons open the app
at `APP_URL` (compose passes `https://app.${DOMAIN}`). Gmail's daily sending limit caps how
many sign-up codes go out in a day; a real email provider (gate 1) lifts it.

**Sign in with Google (D134):** off until the owner's Google Cloud clients exist.
1. **Google Cloud (owner):** a project; Google Auth Platform, Branding: the app's name, a
   support email, the home page `https://<domain>`, the privacy notice
   `https://<domain>/privacy`, the terms `https://<domain>/terms`, the authorized domain
   `<domain>`; Audience: External, then publish (only the `openid`, `email` and `profile`
   scopes, which need no verification). Clients: a **Web application** client (JavaScript
   origin `https://app.<domain>`, redirect URI `https://app.<domain>/auth/google`), and an
   **Android** client with the package `dev.datingapp.beta` and the signing key's SHA-1
   (the CI APK's debug key: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`; a
   release key gets its own Android client).
2. **`infra/beta/.env`:** `GOOGLE_CLIENT_ID=` the Web client's ID, `GOOGLE_CLIENT_SECRET=`
   its secret (checked by format, never printed; to check the pair without a user, send a
   made-up code to `https://oauth2.googleapis.com/token` with them from a script that prints
   Google's error only: `invalid_grant` means the pair is right, `invalid_client` that it
   isn't); compose sets `GOOGLE_REDIRECT_URI`. Then
   `docker compose up -d --no-deps api worker`: the apps read the settings at run time, so
   the web app and the APK show the button with no rebuild (the APK needs a build from
   D134 onwards, which carries Google's native part).
3. **Check:** `https://api.<domain>/v1/auth/google` says `"enabled": true`; then GOOGLE-M1
   (test-plan.md) on the web app and the phone.

6. **Razorpay, later (owner):** a Razorpay account with KYC; a plan; test keys first
   (`PAYMENTS_BACKEND=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_PLAN_ID`) and the webhook (`https://api.<domain>/v1/webhooks/razorpay`, its
   secret in `RAZORPAY_WEBHOOK_SECRET`, events `subscription.*`); live keys only with the
   owner's go (the beta allows live payments for the UPI pass only).

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

**A deletion request by email** (D150; the website's `/delete-account` page offers it to members who can't sign in: suspended, banned, or without a working password or Google account). Answer within 7 days, as the privacy notice promises.
1. **Check it's theirs.** A From line can be forged, so reply to the account's own address (never to a different Reply-To), saying you'll delete the account if they confirm, and that until then nothing happens. Act only on a reply that arrives from that address. A request from any other address can't be checked: say so, and point to "Forgot your password?" (which needs the same mailbox).
2. **Look first** (changes nothing): `docker compose exec api datingapp-api delete-account <email>` from `infra/beta`, as for invites and staff enrolment. It says what it found: no account; a staff account (an admin closes those; this command refuses); a sign-up that never confirmed its email (deleted automatically 7 days after it started, so nothing to do; tell them the date); already waiting (tell them the date); or what it would do, and whether an open report can hold it.
3. **Do it:** the same with `--yes`. As the member's own request does: hidden and signed out at once, matches end (their chats close live), Live calls end, deleted after 7 days (an open report can hold it up to 30 more). A suspended or banned account keeps its status, so it can't sign in to keep the account; a banned one still leaves its email's keyed hash for a year. The audit log records `account.deletion_requested` with `via: operator`.
4. **Reply** with the date it printed (India date), and that an active member can still keep the account by signing in before then. Delete the email thread after the purge date; keep no copy of the request elsewhere.

**Complaints** (D155; `kinaara.online/complaints` names you as the grievance officer). The IT Rules' limits since 10 February 2026: every complaint acknowledged within 24 hours and resolved within 7 days; a request to remove content the rules forbid, within 36 hours; an image showing the complainant nude or in a sexual act, or impersonating them, removed or blocked within **2 hours**; a court's or government agency's order within 3 hours.
1. **Every day:** read the contact address and the console's report queue. Keep your phone's notifications on for the contact address: a subject starting "Urgent: image" is the two-hour kind.
2. **Acknowledge** each email within 24 hours: received, and when they'll hear.
3. **Act.** An in-app report: open it in the console and take its action (remove the photo, warn, suspend or ban). An emailed complaint about a profile: the console can't look a member up yet (stage 28e), so ask them to report it in the app if they can; otherwise it needs the developer (a database query) until 28e.
4. **Resolve** within 7 days (36 hours for a removal request): reply with what you decided. If you refused, say they can appeal to the Grievance Appellate Committee at gac.gov.in within 30 days.
5. **Keep a record:** the email thread and the console's action (the audit log keeps it). Never save an intimate image anywhere.
6. **Orders from a court or a government agency:** acknowledge them; act within 3 hours where they order a removal; anything else goes to the lawyer (`lawyer-brief.md`, question 8).

## First week after launch (planned)

- **Daily:**
  - the error rate, failed jobs and the moderation queue age (underage reports first);
  - photo review backlog;
  - sign-up and verification email delivery.
- **The core journey** on the live site and on an Android and an iOS phone: sign up, profile, photos, introductions, like, match, chat, report, delete.
- **Accessibility spot checks** with TalkBack and VoiceOver.
