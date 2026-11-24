# Business and operations plan

Written 2026-11-24 at the owner's request: a realistic plan for launching and running Kinaara,
based on what the project actually is. Prices and salaries were read that day from public sources
(listed at the end) at US$1 = ₹93.00; anything not from a source is marked **estimate**, with its
assumption. The owner's choices on the same day (D151): the domain is bought and working; the
server is a friend's self-built machine; email stays on the owner's Gmail; marketing is Instagram
and personal networks only. Costs for each launch item are in `launch-plan.md`, section 6.

## 1. What the project is today

**Built, tested and live on the beta** (kinaara.online, app.kinaara.online, the Android APK):
sign-up with an emailed code or Google; an 18+ declared-age gate; profiles with photos that a
moderator approves before anyone sees them; a short daily set of introductions matched both ways;
likes, passes and atomic matches; real-time chat; blocking, reporting and unmatching; a staff
console with two-factor sign-in and an audit trail (reports, photo review, account actions, payment
approval); privacy controls, pause and account deletion (in the app, on the web, and by email
through the operator); Live video calls with strangers through a relay (5 free one-minute calls);
Plus as a ₹299 UPI pass approved by an admin; an app tour read aloud; a safety guide with India's
helplines; ads in the Android app (built, off); a bilingual website. Operations: daily verified
backups with encrypted copies in Google Drive, an hourly health check that emails the owner,
monthly base-image updates with rollback, CI on every push.

**Its size:** 88 API operations in 18 modules, 17 database migrations (40 tables), 26 app screens,
15 website routes; about 27,000 lines of Python and 22,000 of TypeScript; 436 API tests, about 240
app tests, 40 website tests and 23 end-to-end browser tests, all in CI. Built in three weeks (194
commits since 2026-11-04) by the owner with an AI coding assistant.

**Not built yet, needed as it grows:** push notification delivery (built, waits for an Expo and
Firebase project, free); an iPhone app; selling Plus inside the Play app (Play Billing) or by card
(Razorpay); photo storage in a bucket and email through a provider (both planned, D053 and blocker
2); a load test and error tracking; product numbers for the weekly measures (`launch-plan.md`,
section 7, need queries or a console page); the Play launch items (27d-27f in `progress.md`).

**What really costs money here is people, not servers.** The whole beta uses about 380 MB of
memory; the call relay is free for about 60,000 one-minute calls a month; Gmail sends up to 500
emails a day for free. The work that grows with members is human:

| work | why it can't wait | founder hours per month at 1,000 active members (**estimate**) |
| --- | --- | --- |
| Photo review | no photo is shown until a moderator approves it | about 4 (300 new members a month × 3.5 photos × 12 seconds) |
| Reports, including Live calls | IT Rules 2021: grievances acknowledged within 24 hours and resolved within 15 days; intimate or morphed images removed within 24 hours of a complaint, so someone checks every day | 2-6 (2-5 reports per 100 active members, 7 minutes each) |
| Plus payments | each UPI reference is checked against the bank by an admin | about 1 (50 passes, 1.5 minutes each) |
| Support email | sign-in trouble, deletion by email, refunds | about 2 |
| Instagram and founding members | the only marketing channel | 20-25 (3-4 Reels a week) |
| Releases and fixes, with the AI assistant | updates, Play submissions, incidents | 10-20 |
| **Total** | | **about 40-60 hours a month (10-15 a week)** |

## 2. The lean setup, and when to upgrade

| part | now | its limit | upgrade when | then |
| --- | --- | --- | --- | --- |
| Domain | kinaara.online at Hostinger, paid | renews ₹3,489 by 5 Nov 2027 | keep | |
| Server | this laptop through the Cloudflare Tunnel, as today (the owner, 2026-11-24); a friend's self-built machine later, the same tunnel moving with it | its power, internet upload and the friend's goodwill; photos are served from it (1080 and 400 px JPEGs, not cached by Cloudflare) | outages twice a month, memory or CPU above 70%, or around 5,000 daily members | a VPS: Lightsail 4 GB, ₹2,232 a month (2 GB: ₹1,116) |
| Email | the owner's Gmail over SMTP | 500 emails a day, then blocked for 1-24 hours (each sign-up and password reset is an email) | about 300 a day | Amazon SES, ₹9.30 per 1,000 emails |
| Photos | the server's disk | the disk and the upload speed | the server's upload becomes the bottleneck | Cloudflare R2: free to 10 GB, no download fees |
| Marketing | Instagram and personal networks | reach | after product-market evidence (section 8) | Google Search ads from ₹15,000 a month |

**Before moving to the friend's server** (it will hold every member's personal data):
- It must be in India (the privacy notice says so) and have an SSD, at least 4 GB of memory, a UPS and a steady connection (ask its upload speed: photos come from it).
- A short written agreement with the friend: confidentiality, no access to the data, how it is secured, what happens when it ends. Under the DPDP Act the friend is a processor for you.
- Disk encryption on, the OS kept updated, only your account administers it; Cloudflare Tunnel needs no open ports.
- The same backups to Drive and the health check (cron on Linux); then restore a backup there once.
- The privacy notice's hosting line then says the server is run for us by someone else in India (the next documents version, 27f).
- Keep a Gmail account used only for the app, not a personal inbox: every code sent stays in its Sent folder, which holds members' addresses (privacy inventory).

## 3. Launch budget (one-time)

| item | cost | needed? |
| --- | --- | --- |
| Domain (first year) | ₹99 | paid |
| Google Play developer account | ₹2,325 (US$25) | yes, now |
| A lawyer's review of the terms and privacy notice (the brief is ready: `lawyer-brief.md`) | ₹10,000-25,000; plan ₹20,000 | yes, before the public launch |
| Moving to the friend's server | ₹0 (the owner with the AI assistant) | yes, before the public launch |
| A UPS for that server, if it has none | ₹3,000-5,000 (**estimate**) | if missing |
| Trademark "Kinaara", filed online as an individual | ₹4,500 a class; classes 45 (dating services) and 9 (the app): ₹9,000 | recommended; someone else could file first |
| Contingency, 20% | about ₹7,000 | yes |
| **Total** | **about ₹42,000**; the bare minimum (Play and an online-platform review) about ₹12,000-15,000 | |

The app's development itself needs no new money: it is built.

## 4. Running costs after launch

**Stage 1, now to about 1,000 active members** (the lean setup):

| item | per month | per year |
| --- | --- | --- |
| Server (the friend's) | ₹0; a share of electricity and internet if offered: ₹500-1,000 (**estimate**) | ₹0-12,000 |
| Domain | ₹291 | ₹3,489 |
| Email, photo storage, call relay, Cloudflare, GitHub, uptime checks, Drive backups | ₹0 (free limits) | ₹0 |
| Marketing | ₹0 | ₹0 |
| The AI coding assistant (Claude Pro or Max, as now) | ₹1,860-9,300 | ₹20,000-1,12,000 |
| **Cash total** | **about ₹2,000-10,500** (₹300-1,300 without the assistant) | **about ₹24,000-1,27,000** |
| Your time | 40-60 hours a month (section 1) | |

**Stage 2, about 1,000-10,000 active members** (part-time help; section 5):

| item | per month |
| --- | --- |
| Two part-time moderators, 3-4 hours a day each, covering all 7 days; they also answer support email | ₹24,000-36,000 |
| A freelance social media and community person (Instagram Reels, outreach, events) | ₹10,000-15,000 |
| A freelance developer on retainer, 15-20 hours a month at ₹1,000-2,000 an hour | ₹15,000-40,000 |
| A chartered accountant (books, tax returns; company filings once registered) | ₹2,000-4,000 |
| VPS when needed, email provider, photo bucket, domain | ₹400-3,200 |
| The AI coding assistant | ₹1,860-9,300 |
| Paid marketing (optional, once Google certifies the app) | ₹0-15,000 |
| **Total** | **about ₹53,000-1,22,000 a month (₹6.4-14.7 lakh a year)** |
| Fees on sales, only when Plus is sold that way | Razorpay 2% (plus GST on the fee); Play Billing 15% |

**Stage 3, 10,000 members and up** (a funded team; section 6): **about ₹2.9-6.8 lakh a month
(₹35-82 lakh a year)**: payroll ₹2.6-5.8 lakh, infrastructure ₹15,000-50,000 (**estimate**: a
managed database, two or more app servers, the bucket, an email provider, monitoring, the relay
beyond its free limit), marketing ₹15,000-50,000.

## 5. The team

**Now (stage 1): no hires.** You run it with the AI assistant, as you built it:
- **You:** product owner; the published grievance officer (acknowledge within 24 hours, resolve within 15 days); the first moderator and support; approving Plus payments (an admin's job in the console); Instagram and founding members; the go for every release.
- **The AI assistant:** features, fixes, tests, releases and documents, under your review.
- **Outsourced, per job:** a lawyer (the review, later the DPDP rules from May 2027, any police request); a chartered accountant once there is revenue or a company.

**Stage 2: part-time and freelance, in this order:**

| role | when | what they do | how to engage |
| --- | --- | --- | --- |
| Trust and safety moderator 1 | photo review and reports take over an hour a day, or before any paid push | the photo queue, reports (chat, profiles, Live), warnings, suspensions and bans in the console, the 24-hour removals, the support inbox | part-time, paid hourly or monthly, with a written confidentiality agreement; at least one woman (the product promises women's safety) |
| Trust and safety moderator 2 | evenings and weekends need cover (Live calls peak at night) | the same, on the other days and hours | part-time |
| Social media and community | when you can't keep 3-4 Reels a week | Reels, replies, campus and community events in Delhi NCR | freelance, monthly fee |
| Developer on retainer | before the public launch, as a backup for you and the assistant | emergencies, reviewing changes, Play and later iPhone releases, security updates | freelance, a fixed number of hours a month; someone who can run the tests and CI |
| Chartered accountant | first revenue, or a company | books, GST if needed (registration becomes compulsory for services past ₹20 lakh a year: confirm with the CA), tax returns, company filings | outsourced |

Keep moderation away from anonymous gig platforms: moderators see private photos, reported
messages and Live reports. The console already gives each staff member their own two-factor
sign-in and records what they open.

**Stage 3: full-time core.** A trust and safety lead with 3-4 moderators in shifts, 1-2 support
executives, a backend engineer (Python), a mobile engineer (React Native), a marketing and
community manager; design and testing stay freelance. Engineering and trust and safety are the
two to keep in-house: one holds the code, the other holds members' trust.

## 6. Salaries (Delhi NCR, monthly, 2026)

| role | full-time market rate | part-time or freelance | stage |
| --- | --- | --- | --- |
| Content moderator | ₹26,000-38,000 (Glassdoor New Delhi, middle half; average ₹31,875) | half-time ₹12,000-18,000 (**estimate**: half the full-time rate) | 2 part-time, 3 full-time |
| Trust and safety lead | ₹40,000-60,000 (**estimate**: above moderator pay) | | 3 |
| Customer support executive | ₹15,000-25,000 entry, ₹20,000-38,000 experienced chat support | moderators cover it in stage 2 | 3 |
| Social media executive (Instagram) | ₹20,000-35,000 (typical ₹25,700) | ₹10,000-15,000 (**estimate**) | 2 freelance, 3 manager ₹30,000-50,000 |
| React Native developer (1-3 years) | ₹33,000-67,000 (₹4-8 lakh a year; median about ₹5 lakh) | ₹1,000-3,200 an hour (Indian freelancers on Upwork: US$15-34) | 2 retainer, 3 full-time |
| Python backend developer (2-4 years) | ₹50,000-83,000 at services firms, ₹83,000-1,50,000 at product startups | as above | 2 retainer, 3 full-time |
| Chartered accountant | | ₹2,000-4,000 a month; a company's yearly filings ₹15,000-50,000 | 2 |
| Lawyer | | ₹10,000-50,000 per job | 1 onward |

**Payroll by stage:** stage 1: ₹0. Stage 2: **about ₹51,000-95,000 a month** (two part-time
moderators, social media, developer retainer, CA). Stage 3: **about ₹2.6-5.8 lakh a month**
(the lead, 3-4 moderators, 1-2 support, two engineers, a marketing manager, freelance design and
testing). With 10 or more employees, ESI and PF rules start to apply (about 3-15% more): the CA
will say which. Laptops for engineers: about ₹40,000-60,000 each (**estimate**).

## 7. Growth and scalability

| when | technical step | cost | team step |
| --- | --- | --- | --- |
| before any paid push | a load test, error tracking, the weekly numbers in the console | ₹0 (free tiers; the assistant builds them) | |
| about 300 emails a day | Amazon SES (adapter to build) | ₹100-500 a month | |
| the friend's server falls short | a VPS in Mumbai | ₹1,116-2,232 a month | |
| photos slow the server | photos in Cloudflare R2 (adapter to build) | free to 10 GB, then $0.015 a GB | |
| about 50 Plus passes a month | Play Billing in the Play app and Razorpay on the web, so payments stop needing a person | 15% and 2% of those sales | |
| members ask for iPhone | the iPhone app | US$99 (₹9,207) a year | the developer retainer grows |
| around 5,000 daily members | a separate managed database and two app servers (`deploy.md`, staging plan) | ₹5,000-15,000 a month (**estimate**) | full-time trust and safety |
| 10,000+ members | the stage 3 team and infrastructure | section 4 | section 5 |

The code is ready for these steps (a modular API, background jobs, an audit trail, retention
rules, CI and an end-to-end suite); none needs a rewrite. The limits to watch first are people
(moderation and the founder's hours), then Gmail's 500 a day, then the home server's upload.

## 8. Funding

**Development is already paid for in time.** What needs money is the launch, the months after it
and, later, people.

| what | amount |
| --- | --- |
| **A. Launch and 12 lean months (recommended now, your own money):** the launch (section 3) about ₹42,000; 12 months of running costs about ₹4,000-15,000; the AI assistant ₹20,000-1,12,000; an emergency reserve about ₹20,000 (6 months of a VPS if the friend's server fails, SES, a second legal opinion) | **about ₹90,000 with Claude Pro, about ₹1.8 lakh with Max** |
| **B. Stage 2 for 12 months, after the milestones below:** about ₹80,000 a month, company registration ₹10,000-25,000, a year's company compliance ₹15,000-50,000, and 15% contingency | **about ₹10-12 lakh** (6 months: about ₹5.5-6.5 lakh) |
| **C. Stage 3, a funded team for a year** | **₹35-82 lakh** (a seed round) |

**The plan:**
1. **Now:** put aside about ₹1-1.5 lakh (A). Open the Play account, finish 27d-27f, run the closed test with 12 or more testers for 14 days, have the lawyer review the documents, move to the friend's server, then Play production.
2. **Milestones in 3-6 months, before spending on people:** 1,000 verified members in Delhi NCR with at least 40% women; members still active after 30 days; reports handled within 24 hours; at least 50 Plus passes a month.
3. **Then raise B (₹10-12 lakh):** friends and family or angels; or register a company (a private limited company if you will raise money), get DPIIT recognition (free) and apply through incubators to the Startup India Seed Fund Scheme: a grant of up to ₹20 lakh for product trials, debt up to ₹50 lakh for market entry (individuals can't apply; the company must be under 2 years old).
4. **C only with growth that holds** (the launch plan's phase 3).

**Breaking even:** stage 1's cash cost (about ₹2,000-10,500 a month) is covered by 7-35 Plus
passes a month. Stage 2 (about ₹80,000 a month) needs about 270 passes a month at ₹299: about
5,400 active members if 5% pay (`pricing.md`: 5-15% of monthly users typically pay in India).
Ads add a little.

## 8a. A launch for ₹0 (the owner asked, 2026-11-24)

Possible, because everything that runs the app is already free (the friend's server, Gmail,
Cloudflare, the call relay's free tier, GitHub, Drive backups, uptime checks, Instagram, UPI with
no fees) and the domain is paid until November 2027. The one unavoidable fee is Google's US$25,
for Play or for verifying a developer whose app is installed outside Play. Free ways out to members:
- **The web app** (app.kinaara.online): everything, Live calls and UPI included, in any phone's browser, with no store and no Google fee, for good. Not yet installable to the home screen: a web app manifest (free) would add that.
- **The Android APK from the website:** free until Google's developer verification reaches India (global rollout from January 2027; first countries live 30 September 2026). After that, an app from an unverified developer installs only after a 24-hour wait; the free "limited distribution" account covers 20-50 devices; full verification is the same US$25 with an ID. It also needs a download page (GitHub Releases is free for this public repository), and members update by hand.
- **Indus Appstore** (PhonePe): free registration and listing and no commission in 2026 (third-party reports; its terms allow fees after notice). Smaller reach than Play; the 2027 verification likely applies to its installs too.

Given up at ₹0: Play's reach, trust and automatic updates; ads (AdMob needs the app public on a
supported store); the lawyer's review (a lawyer friend or a law school's legal aid clinic may help
for free; get one before charging money at scale); the trademark (the IP India search is free);
and the AI assistant's subscription (Claude's free plan has no Claude Code). **Suggested:** launch
free on the web app and the APK, and pay the ₹2,325 for Play from the first 8 Plus passes, before
January 2027.

## 9. Risks and their contingency

| risk | what it costs | the plan |
| --- | --- | --- |
| You are the only operator: illness, exams, burnout | everything stops; grievance deadlines are missed | the first moderator and the developer retainer before the public launch; written runbooks (`deploy.md`) |
| The friend's server fails or the friendship changes | downtime | the backups and a VPS in a day (₹1,116-2,232 a month); the Docker setup moves as it is |
| Gmail blocks sending for a day | nobody can sign up or reset a password | switch to SES at 300 emails a day, before it happens |
| A serious safety incident (Live, harassment, a minor) | members' safety, the Play listing, legal exposure | daily report checks, the 24-hour removals, a lawyer on call, the safety guide; never skip photo review |
| The law changes (DPDP from 13 May 2027) | rework, fines | the lawyer's review now, a privacy check-up before May 2027 |
| The AI assistant becomes unavailable or costlier | slower fixes | the developer retainer knows the code; tests and docs keep it learnable |

## Sources (read 2026-11-24)

- Salaries: Glassdoor, "Content Moderator, New Delhi" (glassdoor.co.in, 134 salaries, Oct 2026); PayScale, "Content Moderator, India"; Glassdoor, "Customer Service Executive, New Delhi" (Mar 2026) and Delhi job listings; Glassdoor, "Social Media Executive, New Delhi" (Oct 2026) and DigitalVidya; Flexiple (Aug 2026), SpotSalary (Aug 2026) and Glassdoor India for React Native developers; Vtricks (Jun 2026), igmguru and WsCube Tech (citing AmbitionBox) for Python developers in Delhi NCR; Upwork, "React Native developers in India" (Nov 2026) and IgnitedIdea for freelance rates.
- Rules: MeitY's note on the IT Rules 2021 (static.pib.gov.in), Rule 3(2): acknowledge within 24 hours, resolve within 15 days; intimate images removed within 24 hours; DPDP Rules notified November 2025, core duties from 13 May 2027 (Consently, and `deploy.md`).
- Funding: Startup India Seed Fund Scheme (seedfund.startupindia.gov.in, FAQ and guidelines; the June 2026 schemes playbook).
- Legal and company costs: LegalKart, ContractDesk and Consently (privacy policy and terms); Patron Accounting, Complykart and others (company registration and yearly compliance).
- Services: Gmail's sending limits (support.google.com/mail/answer/22839); Anthropic's plans (claude.com/pricing); the rest as in `launch-plan.md`, section 6.
- A ₹0 launch: Android Developer Console Help, "Understanding Android developer verification" (support.google.com/android-developer-console/answer/16561738: US$25 for full distribution, no fee for limited distribution to up to 20 devices) and developer.android.com's registration guide; news of the January 2027 global rollout and a 50-device limit (November 2026, third-party); Indus Appstore's terms as reported by PhonePe's 2023-2024 announcements and SwadeshiApps (September 2026).
- The project's numbers from the repository and `docker stats` on 2026-11-24.
