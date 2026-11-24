# Launch plan: Kinaara in Delhi NCR

Date: 2026-11-20. replica-launch step 4, at the owner's request: "make a strategy to launch it
and video to post it on instagram for getting views and make it available for google ads and
also turn off ads when subscription is on". Decisions: D137 (ads in the app), D138 (the Reel),
D139 (this plan and Google Ads). Facts that change are dated; sources are at the end.

## 1. Where we are

**Working on the beta (kinaara.online, app.kinaara.online, the Android APK):** sign-up with email
or Google, profiles with photo review, the daily set, likes, matches and chat, Live video calls (5
free), Plus as a UPI pass, blocking, reporting and moderation, privacy controls and deletion, and
the app tour in words and voice. In-app ads are built and off (D137).

**Not ready for a public launch.** These come before any paid promotion:

1. **Hosting:** the beta runs on the owner's laptop at home (D097). A public launch needs the
   Mumbai server (D096) with backups and monitoring.
2. **Legal:** the terms and privacy notice are beta drafts (`beta-2026-11-20`); a lawyer's
   review, including India's grievance-officer duties for platforms (blocker 3).
3. **Email:** Gmail over SMTP is fine for a beta, not for volume: a provider with SPF, DKIM and
   DMARC (blocker 2).
4. **Photos:** on the server's disk; a private bucket before scale (blocker 4).
5. **People on duty:** photo review and reports need someone every day. Target: new photos
   reviewed within 12 hours, reports within 24.
6. **Google Play:** new personal developer accounts must run a closed test with at least 12
   testers, opted in for 14 days in a row, before production (checked 2026-11-20). The Play build
   must not sell the UPI pass: digital features in a Play app go through Play Billing (or
   user-choice billing in India); see `pricing.md`. Until Play Billing exists, the Play build shows
   Plus as unavailable (`EXPO_PUBLIC_WEB_CHECKOUT` off) and the web app sells it.

## 2. Positioning

For single adults of 22 to 34 in Delhi NCR who want something serious and are tired of swiping.

- **The line:** "Fewer, better introductions." Hinglish: "Kam log. Sahi log."
- **Why us:** intention required and matched both ways; a short daily set; the same few likes
  for everyone, never sold; Live calls with their video hidden until you choose; every safety tool
  free; honest labels (only what we checked); an area, never an exact location.
- **Never:** another app's name in ads, keywords, listings or captions (store and trademark rules);
  invented proof (user counts, ratings, testimonials, "trusted by"); people or couples in visuals
  (D099: stock licences forbid people in dating promotion); urgency, countdowns or streaks.

## 3. Phases

| phase | when (from 2026-11-20) | what | done when |
| --- | --- | --- | --- |
| 0. Ready | week 1 | the Mumbai server, the email provider, the lawyer starts; the owner opens the Play Console, AdMob, Google Ads and Meta Business accounts; applies for Google's dating certification and Meta's dating-ads permission; sets up the Instagram profile | blockers 1-5 have dates; accounts exist |
| 1. Founding members | weeks 1-3 | 100 founding members in Delhi NCR from personal networks and organic Instagram, women first; the owner talks to the first 10 by hand; 12+ Play closed testers start their 14 days | 100 verified members, at least 40% women; 12 testers for 14 days |
| 2. Soft launch | weeks 3-6 | Play production; real in-app ads switched on (a live build); Google Search ads on a small budget once certified; Reels 3-4 a week | Play listing live; cost per active member known per channel |
| 3. Grow | week 6 on | more budget where cost per *active* member (2 approved photos, active in 7 days) is lowest, keeping the gender balance | weekly review (section 7) |

Paid promotion waits for the gender balance: sending paid traffic into an unbalanced pool makes
matches rarer for everyone.

## 4. Channels

### Instagram (organic first)

- **Profile:** handle to choose and check (for example `kinaara.app`); bio: "Fewer, better
  introductions · Delhi NCR · 18+ · Beta"; link: kinaara.online. Highlights: How it works, Safety,
  Live, Plus.
- **The first Reel** (D138): `marketing/reel`, rendered by the `reel` workflow in English and
  Hinglish (1080 x 1920, 23 s, H.264, cover at 6.6 s). It is silent on purpose: add a track from
  Instagram's own audio library when posting (licensed for Reels there; never add outside music).
  Post the Hinglish one first; the English one a few days later.
- **Caption (Hinglish):** "Swipe karte karte thak gaye? Kinaara pe roz ek chhota set milta hai:
  sirf wahi log jo aap jaisa chahte hain, dono taraf se match. Likes sabke liye barabar, safety
  tools hamesha free. Delhi NCR, 18+, beta. Link bio mein."
- **Caption (English):** "Tired of endless swiping? Kinaara gives you a short daily set of people
  who want what you want, matched both ways. The same few likes for everyone, safety tools always
  free. Delhi NCR, 18+, beta. Link in bio."
- **Hashtags** (5 to 8): #DelhiNCR #DelhiDating #DatingApp #SeriousRelationship #Gurugram #Noida
  #NoMoreSwiping #Kinaara. No other app's name.
- **Pillars, 3-4 Reels a week:** (1) the problem: swipe fatigue, in text on the brand's world;
  (2) how it works: one stop a Reel (Today, Likes, Live, Matches, Safety), from the same
  composition; (3) honesty and safety: equal likes, photo review, video hidden until you choose;
  (4) first-date safety in Delhi NCR (public places, tell a friend, your own way home); (5) the
  founder's own story, on camera, if the owner wants to.
- **When:** weekday evenings 7-10 pm and Sunday afternoons IST to start; keep what the account's
  insights show works.
- **Replies:** within hours; pin a comment: "18+ · Beta · Link in bio".
- **Paid:** boosting a post is an ad. Meta allows dating ads only with prior written permission and
  18+ targeting (checked 2026-11-20); creators' paid partnership posts for dating need Meta's
  authorisation too. Apply in phase 0; nothing paid on Instagram before the answer.

### Google Search ads

- **Certification first.** Dating and companionship ads need Google's certification (General:
  Search, Display and Video; Restricted: Search only). India is not on the list of excluded
  countries (checked 2026-11-20). The application asks for the Google Ads customer ID, the landing
  domains (kinaara.online, app.kinaara.online) or Play app IDs, and a test login for reviewers (a
  labelled reviewer account, made for that). The site must prohibit under-18s, paid dating ("sugar")
  and international matchmaking or mail-order services: the terms `beta-2026-11-20` do.
- **Campaign 1:** Search, Delhi NCR (Delhi, Gurugram, Noida, Ghaziabad, Faridabad), English and
  Hindi, ₹500-1,000 a day, landing on kinaara.online (English) and kinaara.online/hi (Hindi).
- **Keywords** (phrase and exact): dating app delhi; dating app delhi ncr; serious dating app;
  dating app for serious relationship; dating app for marriage minded; meet singles gurugram;
  noida dating app; safe dating app india; dating app without swiping.
- **Negative keywords:** free sex, hookup, escort, call girl, sugar, massage, adult chat, apk mod,
  hack, job, every other dating or matrimonial brand's name.
- **Responsive search ad, English** (headlines up to 30 characters, descriptions up to 90; all
  checked): headlines "Fewer, Better Introductions", "Dating in Delhi NCR", "Intent Matched Both
  Ways", "Equal Likes. Never Sold.", "Safety Tools Always Free", "Free to Join, 18+", "No Endless
  Swiping", "Kinaara: Serious Dating", "Short Video Calls, Your Way", "Photos Reviewed First", "Now
  in Beta in Delhi NCR", "Meet People Who Want More", "Gurugram, Noida, Delhi", "A Small Set Every
  Day", "Kinaara Dating App"; descriptions "A short daily set of people who want what you want,
  matched both ways. Free, 18+.", "Everyone gets the same few likes a day, never sold. Chat only
  when you both say yes.", "Short video calls: their video stays hidden until you choose. End or
  report anytime.", "New photos are reviewed before anyone sees them. Block and report are always
  free."
- **Hinglish ad:** headlines "Delhi NCR Mein Dating", "Kam Log. Sahi Log.", "Swipe Se Thak
  Gaye?", "Likes Sabke Liye Barabar"; descriptions "Roz ek chhota set: wahi log jo aap jaisa chahte
  hain. Free, sirf 18+ ke liye.", "Baat tabhi jab dono ne haan kaha. Block aur report hamesha free."
- **Measuring:** no Google tag on the site yet (the privacy notice doesn't cover website tracking).
  Start from Google Ads' own clicks and cost and the beta's daily sign-ups; add conversion tracking
  only with a consent notice, after the lawyer's review.
- **App campaigns** (installs) only once the Play listing is public.

### Other channels

- **Founding members:** the owner invites people personally and asks each to bring two friends;
  no rewards for invitations (they would manufacture activity).
- **Communities:** alumni and professional groups in Delhi NCR, women-led groups first, with the
  safety angle; genuine posts by the owner, no spam.
- **Press:** an honest beta story for Indian startup media once the Mumbai server is live.
- **Reddit** (r/delhi, r/gurgaon): only as a participant answering questions.

## 5. Money

- **Plus:** ₹299 for 30 days by UPI (D127): Live calls after the free 5, longer calls, and no ads.
- **Ads in the Android app** (D137): free members see a banner at the foot of Today, Likes and
  Matches, and now and then a full-screen ad back on Today after a few decisions (at most 1 per 4
  decisions and 4 minutes, 5 a day, none in someone's first day or right after a match). Never in
  chats, Live, profiles, Safety, payments, sign-up or the tour; non-personalised, rated T. The web
  app has none. **Real ads need:** the app public on Google Play, linked in AdMob and approved (an
  unlinked app can't be reviewed; checked 2026-11-20); the owner's AdMob app ID and two ad units
  (public IDs, given to the `android-apk` workflow); `app-ads.txt` on kinaara.online with the
  publisher ID; AdMob's blocking controls set to block dating, matrimonial and adult categories and
  competitors; and testers told before ads start for them (the notice changed on 2026-11-20).
- Revenue from ads will be small at this size; Plus is the main line.

## 6. What the launch costs (payment chart)

Prices read 2026-11-24 on each provider's own page (sources at the end), at that day's rate of
US$1 = ₹93.00, rounded. Most providers add 18% GST for Indian buyers. Paid so far: the domain's
first year (₹99).

**The owner's lean choice (2026-11-24, D151):** a friend's self-built server instead of the
Lightsail server, the owner's Gmail (up to 500 emails a day) instead of SES, and Instagram and
personal networks instead of paid marketing. So the cash needed for the launch is the Play fee
and the lawyer's review (about ₹12,000-42,000 with the trademark and a reserve); the paid items
below come in when the limits are reached. The running costs, the team, salaries and funding are
in `business-plan.md`.

**Needed for the launch**

| what | cost | when | notes |
| --- | --- | --- | --- |
| Google Play developer account | US$25 (₹2,325), once | now | a card and ID in the owner's legal name, and an Android device, are verified; the fee isn't refunded if the details are invalid |
| A lawyer's review of the terms and privacy notice | a quote | before the public launch | blocker 3; `lawyer-brief.md` is ready: ask 2 or 3 lawyers |
| The Mumbai server (Lightsail, 2 GB, D096) | US$12 a month (₹1,116) | when the beta moves off the laptop, before the public launch | 2 vCPUs, 60 GB disk, 1.5 TB transfer a month in Mumbai; the beta's seven containers use about 380 MB; 4 GB is US$24 when needed |
| Email from our own domain (Amazon SES) | US$0.10 per 1,000 emails (₹9.30); about ₹100-200 a month at launch | before launch volume (blocker 2) | new AWS accounts get up to US$200 of credits for 6 months |
| The domain `kinaara.online` (Hostinger) | ₹3,489 a year | by 5 Nov 2027 (charged about 27 days before) | registered 2026-11-05; moving it to another registrar costs ₹3,009 |

**Free at launch volumes** (charged only past these limits)

| what | free up to | then |
| --- | --- | --- |
| Photo storage (Cloudflare R2, blocker 4) | 10 GB a month | US$0.015 per GB a month; downloads free |
| Live calls' relay (Cloudflare Realtime) | 1,000 GB a month, about 60,000 one-minute calls | US$0.05 per GB |
| Cloudflare DNS, Tunnel and Access; UptimeRobot; GitHub (public repository and CI); the encrypted backups in Google Drive (a few MB); AdMob | free plans | |
| Plus by UPI to the owner's own account (D127) | no fees | |

**Recommended**

| what | cost | when | notes |
| --- | --- | --- | --- |
| Registering "Kinaara" as a trademark (IP India, filed online) | ₹4,500 a class for an individual, startup or small enterprise; for example classes 9 (the app) and 45 (dating services): ₹9,000 | after the IP India search and an attorney's opinion (blocker 6) | ₹9,000 a class for other applicants; the attorney's fee is extra (a quote) |

**Marketing: the owner's choice** (monthly, from phase 2)

| tier | what |
| --- | --- |
| ₹0 | Instagram organic, personal networks, communities, press |
| ₹15,000 | plus Google Search at ₹500 a day, once certified |
| ₹50,000 | plus Search at ₹1,000 a day, Instagram and Facebook ads at about ₹20,000 once Meta permits, and Delhi micro-creators |

**Later, not for this launch**

| what | cost |
| --- | --- |
| An iPhone app (Apple Developer Program) | US$99 a year (₹9,207) |
| Razorpay, if Plus moves to cards or renewing payments on the web | no setup or yearly fee; 2% of each payment, plus 18% GST on that fee |
| Plus sold inside the Play app (Play Billing) | Google keeps 15% of auto-renewing subscriptions in India; 4% less through user choice billing |
| SMS sign-up codes (D012) | not planned: DLT registration and an SMS provider first |

**The first year, before GST:** the Play account ₹2,325, the server ₹13,392, email about
₹1,200-2,200 and the domain's renewal ₹3,489 come to **about ₹21,000, plus the lawyer's quote**.
With the trademark in two classes, **about ₹30,000**. Marketing comes on top: ₹0, ₹1.8 lakh or
₹6 lakh a year at the three tiers.

## 7. Measures, every week

Verified sign-ups by channel; the share reaching 2 approved photos; women's share of active
members; day-7 retention; likes to matches; matches to two-sided conversations (the product's
measure of success); reports per 100 active members and time to review; Plus payments; ad revenue
once on; cost per active member by channel.

## 8. Checklists

**Before any paid promotion:** the Mumbai server with backups and monitoring; the lawyer's review;
the email provider; the moderation rota; Google's certification (Search); Meta's permission
(Instagram).

**Before Play production** (the answers and the gaps: `play-console.md`, 2026-11-24): the Play Console account; a release signing key (Play App Signing) and
its own Android OAuth client for Google sign-in; the closed test (12+ testers, 14 days); the Data
safety form (account, photos, messages, area, device IDs for ads, "Contains ads"); the content
rating questionnaire (adults only); the listing (`listing.json`, linted) with screenshots of the
real app (no people); privacy policy and support URLs; the Play build without the UPI pass until
Play Billing.

**Before real in-app ads:** see section 5.

## Sources (read 2026-11-20; the payment chart's on 2026-11-24)

- The payment chart (section 6), each on the provider's page: Google Play Console Help, "Get
  started with Play Console" (US$25 once; support.google.com/googleplay/android-developer/answer/6112435);
  Lightsail pricing (aws.amazon.com/lightsail/pricing; Mumbai bundles get half the transfer);
  Amazon SES pricing (aws.amazon.com/ses/pricing); Cloudflare R2 pricing
  (developers.cloudflare.com/r2/pricing); the domain's registry record (rdap.radix.host:
  registrar Hostinger, expiry 2027-11-05) and Hostinger India's .online price
  (hostinger.com/in/tld/online-domain); IP India, "Forms & Official Fees" (the First Schedule of
  the Trade Marks Rules 2017; ipindia.gov.in/pages/trade-marks/learn/forms-and-official-fees);
  Razorpay's pricing (razorpay.com/pricing); Apple, "Enrollment" (developer.apple.com/support/enrollment);
  Google Play Console Help, "Service fees" (support.google.com/googleplay/android-developer/answer/112622);
  the dollar's rate from open.er-api.com (₹93.00, 24 Nov 2026). Cloudflare Realtime's relay price
  is `pricing.md`'s (read 2026-11-18). The beta's memory use from `docker stats` the same day.

- Google AdMob Help, "App readiness": "All Android apps must be publicly available in a supported
  store in order to link to AdMob" (support.google.com/admob/answer/10564477).
- Google Play Console Help, testing requirements for new personal developer accounts: 12 testers,
  14 consecutive days (support.google.com/googleplay/android-developer/answer/14151465).
- Google Ads policy, "Dating and Companionship": certification; the excluded countries, not India
  (support.google.com/adspolicy/answer/15328393).
- Meta Transparency Center, "Dating ads": prior written permission, 18+
  (transparency.meta.com/policies/ad-standards/restricted-goods-services/dating-ads/).
- Reels: 1080 x 1920, 9:16, H.264 and AAC, 30 fps; safe areas from third-party guides (top about
  14%, bottom about 35%), not an official Meta page.
- react-native-google-mobile-ads 17.4.0 docs: React Native 0.86+, New Architecture, the config
  plugin's `delayAppMeasurementInit` (react-native-google-mobile-ads.dev).
