# Recon map: Tinder, Bumble and Hinge (iOS, Android)

Scope: the core dating loop (sign-up and verification, profile, discovery,
like/pass, match, chat), safety and moderation, and monetization. Not their
friend-finding products, events businesses or partner integrations.
For: an original 18+ dating app (audience and market: `fixes.md`).
Date: 2026-11-04. Every source below was accessed on 2026-11-04.

**Method and limits.** Followed replica-recon (official repo, commit `77c9436`)
with public sources only. No account was used, no app was installed, no
screenshots were taken, and nothing was scraped, decompiled or probed. REA was
not used (decision D005). Screens and flows are inferred from help centers and
announcements, not observed, so click counts were not measured. Text is
paraphrased; numbers are as reported by the cited source.

## Sources

| # | source | URL | source date | notes |
| --- | --- | --- | --- | --- |
| 1 | Tinder Help: subscriptions | https://www.help.tinder.com/hc/en-gb/articles/115004487406 | undated | names Plus, Gold, Platinum; feature table did not render; notes features vary under testing |
| 2 | Tinder: safety features (official) | https://policies.tinder.com/community-resources/safety-features | undated | official list of safety tools |
| 3 | Match Group press: Face Check | https://mtch.com/?p=3758 | 2025-10-22 | liveness verification rollout and claimed results |
| 4 | Mediaweek: Tinder Sparks 2026 keynote | https://www.mediaweek.com.au/tinder-unveils-biggest-product-overhaul-in-years-at-sparks-2026-keynote | 2026-03-13 | trade press |
| 5 | Swipestats: Tinder subscriptions compared | https://www.swipestats.io/blog/tinder-subscription | 2026-07-19 | **secondary**; tier contents and quoted prices |
| 6 | Bumble Support: paid features and plans | https://support.bumble.com/hc/en-us/articles/32668790872733-Understanding-Bumble-s-paid-features-and-subscription-plans | undated | official |
| 7 | Bumble Support: safety features | https://support.bumble.com/hc/articles/28537051467293-Our-safety-features | undated | official |
| 8 | Bumble press: Opening Moves | https://www.businesswire.com/news/home/20240430323928/en/Bumble-Gives-Women-More-Choice-to-Make-the-First-Move | 2024-04-30 | includes a Bumble-commissioned survey |
| 9 | Bumble Inc. Q2 2026 results | https://ir.bumble.com/news/news-details/2026/Bumble-Inc--Announces-Second-Quarter-2026-Results/default.aspx | 2026-08-05 | official investor release |
| 10 | Hinge Help: subscription and purchase benefits | https://help.hinge.co/hc/en-us/articles/38014282744595-Subscription-and-Purchase-Benefits | undated | official |
| 11 | Hinge Help: Your Turn Limits | https://help.hinge.co/hc/en-us/articles/31662181659027-What-is-Your-Turn-Limits | undated | official |
| 12 | Hinge Help: Prompt Feedback | https://help.hinge.co/hc/en-us/articles/30558825479315-How-Prompt-Feedback-Works | undated | official |
| 13 | Hinge press: Hidden Words | https://hinge.co/press/hidden-words | 2024-04-24 | updated 2025-03 (Comment Filter) |
| 14 | Global Dating Insights: Hinge in India | https://www.globaldatinginsights.com/from-the-web/hinge-india-second-largest-market/ | 2026-09-29 | trade press citing Fortune India |
| 15 | Match Group Q3 2026 release (reproduced) | https://www.stocktitan.net/news/MTCH/match-group-announces-third-quarter-83720mk7w8b9.html | 2026-11-02 | qualitative highlights |
| 16 | TradingKey: Match Group Q3 2026 figures | https://www.tradingkey.com/news/presentation/262266720- | 2026-11 | **secondary**; segment numbers |
| 17 | Fortune: FTC settlement with Match Group | https://www.fortune.com/2025/08/13/match-group-ftc-14-million-settlement-deceptive-advertising | 2025-08-13 | regulator action |
| 18 | Pew Research: experiences of U.S. online daters | https://www.pewresearch.org/internet/2023/02/02/the-experiences-of-u-s-online-daters/ | 2023-02-02 | large U.S. panel |
| 19 | GDI: Forbes Health / OnePoll burnout survey | https://www.globaldatinginsights.com/news/new-forbes-study-explores-dating-app-burnout/ | 2024-05-10 | U.S., n = 1,000 |
| 20 | 9to5Mac: Mozilla / Consumers International pricing study | https://9to5mac.com/2022/02/08/tinder-age-discrimination-in-pricing/ | 2022-02-08 | six countries including India |
| 21 | Redseer: India dating and matrimony market | https://redseer.com/articles/whos-winning-in-indias-dating-matrimony-market-and-where-are-the-opportunities-for-platforms-and-investors/ | 2025-12-18 | consultancy report |
| 22 | Mondaq: DPDP Rules 2025 highlights | https://www.mondaq.com/india/privacy-protection/1707558/digital-personal-data-protection-rules-2025-highlights | 2025-11 | legal summary, not legal advice |

## Core loop

All three: profile, then discovery, then like or pass, then a mutual like
creates a match, then chat. What users pay for is **being seen and seeing who
likes them**.

- **Tinder:** a high-volume swipe deck; recent push toward AI-curated daily
  picks, interest "modes" and real-world events [4].
- **Bumble:** swipe; in opposite-gender matches women start the chat, by
  message or by answering a question they set (Opening Moves); matches expire
  unless extended [6][8].
- **Hinge:** like or comment on a specific photo or prompt; a cap on
  conversations awaiting your reply (Your Turn Limits) [10][11].

## Screens (inferred, not observed)

| ID | screen | how to reach | purpose | key components | apps and evidence | confidence |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Welcome, sign-up, login | first launch | create account | sign-in options | all; methods not checked in this pass | guess |
| S02 | Onboarding basics | after sign-up | name, birthdate, gender, preferences | forms | all | guess |
| S03 | Verification | onboarding or settings | prove liveness and photo match; optional ID | video selfie, badge | Tinder Face Check mandatory for new users in several markets incl. India [3]; Bumble photo and ID verification [7]; Hinge selfie verification [13] | high |
| S04 | Profile editor | profile tab | photos, prompts, intentions, interests | photo grid, prompt cards, badges | Bumble intention badges (up to 2), raised minimum photos [8]; Hinge prompt ratings [12] | medium |
| S05 | Discovery | home | browse candidates | deck or feed, like/pass, undo | Tinder deck, modes, AI daily picks [4]; Bumble 4 curated profiles a day [8]; Hinge feed [10] | medium |
| S06 | Profile detail | tap a card | judge fit | photos, prompts, like-on-item | all; Hinge likes target an item [10][13] | medium |
| S07 | Likes You | likes tab | see who liked you | grid, often blurred or gated | Tinder Gold [5]; Bumble Premium [6]; Hinge free sees one at a time [10] | high |
| S08 | Matches list | matches tab | open conversations | list, timers, limit bar | Bumble match windows [6]; Hinge Your Turn progress bar [11] | medium |
| S09 | Chat | open a match | talk | composer, nudges, media, calls | Tinder pre-send nudge and recipient flag [2][4]; Bumble calls, explicit-image blur [7]; Hinge comment filter [13] | high |
| S10 | Block, report, unmatch | profile or chat menu | protect yourself | action sheet, reason picker | Tinder [2]; Bumble [7] | high |
| S11 | Safety center | shield icon | guidance and resources | articles, links | Tinder [2]; Bumble [7] | medium |
| S12 | Settings | profile menu | preferences, pause, incognito | toggles, sliders | Bumble Snooze [7], Incognito (paid) [6]; Hinge advanced filters (paid) [10] | medium |
| S13 | Paywall and store | gated actions | subscribe or buy items | tier cards, item packs | all [5][6][10] | high |
| S14 | Account deletion | settings | leave | confirm dialog | not checked in this pass | guess |

## Flows (inferred; happy-path click counts not measured)

```
F01 Sign up and verify
    S01 -> S02 -> S03 -> S04
    edge: liveness fails; same face on several accounts is flagged [3]
F02 Build a profile
    S04
    edge: thin prompt answers get rated for improvement [12]; minimum photo count [8]
F03 Discover and decide
    S05 -> S06 -> like / pass
    edge: deck runs out; undo is a paid feature (Rewind, Backtrack) [5][6]
F04 Match
    mutual like -> S08
    edge: match expires unless extended [6]; too many chats awaiting your reply blocks new likes [11]
F05 Chat
    S08 -> S09
    edge: harmful message nudged before send [2][4]; explicit image blurred [7]; contact details shared triggers a safety tip [2]; verified-only chat [2]
F06 Protect yourself
    S06 or S09 -> S10
    edge: hide from people you know (Tinder Block Contacts; Hinge Block List in India) [2][14]; LGBTQ+ travel risk alert [2]
F07 Take a break
    S12 -> pause / snooze [7]
F08 Pay and cancel
    S13 -> purchase; cancellation was a regulator issue [17]
F09 Delete account
    S12 -> S14 (not checked in this pass)
```

## Key features compared

| feature | Tinder | Bumble | Hinge |
| --- | --- | --- | --- |
| Liveness / photo verification | Face Check, mandatory for new users in California and several countries incl. India (Oct 2025); flags duplicate faces [3] | photo verification [7] | selfie verification [13]; Face Check in India [14] |
| ID verification | not listed on official safety page [2] | yes [7] | not found |
| Message safety | pre-send nudge and recipient flag, LLM-upgraded in 2026 [2][4] | explicit-image blur; AI scam detection plus human moderators [7] | comment filter (automatic since 2025-03) [13] |
| Hide from known people | Block Contacts (opt-in contact sharing) [2] | not found | Block List (India) [14] |
| Who starts the chat | either | women first in opposite-gender matches, or via Opening Moves [8] | either; likes can carry a comment [10][13] |
| Curated daily picks | AI "Chemistry" picks (2026) [4] | 4 curated profiles a day [8] | compatible profiles sooner (HingeX) [10] |
| Undo a pass | Rewind (Plus) [5] | Backtrack (Boost) [6] | not found |
| See who liked you | Gold [5] | Premium [6] | Hinge+ / HingeX; free sees one at a time [10] |
| Pay to be seen | Boost; Priority Likes (Platinum) [5] | Spotlight; priority (Premium+) [6] | Boost, Superboost, Skip the Line (HingeX), Roses [10] |
| Change location | Passport (Plus) [5] | Travel Mode (Premium) [6] | not found |
| In-app calls | video speed-dating test planned late 2026 [4] | video and voice calls [7] | not found |
| Pause | not found | Snooze [7] | not found |
| Real-world / group | Events beta (Los Angeles), Group Hangouts [4][15] | expanding meetups and group experiences [9] | not found |

"Not found" means not found in the sources read, not that the feature is absent.

## Safety patterns that are now table stakes

1. **Liveness verification at onboarding**, with a verified badge and duplicate-account detection. Tinder made it mandatory for new users in several markets, including India [3].
2. **Verified-only messaging** as a user choice [2].
3. **Nudges before sending** and **easy flagging on receipt** for harmful messages [2][4].
4. **Blurred explicit images**, opened only by choice [7].
5. **Automated scam and fake-profile detection backed by human moderators** [7].
6. **Hide from people you know**: contacts, family, colleagues, exes [2][14].
7. **Comment filters** the user controls [13].
8. **In-app calls**, so phone numbers stay private [7].
9. **Screenshot protection** (Hinge, India) [14].

Match Group attributes a more than 60% drop in exposure to potential bad
actors, and more than 40% fewer bad-actor reports, to Face Check combined with
other measures. It does not isolate Face Check's effect, and it does not
disclose how long face-derived data is kept [3].

## Monetization

- **Model:** all three are freemium. They sell tiered subscriptions (Tinder Plus, Gold, Platinum; Bumble Boost, Premium, Premium+; Hinge+ and HingeX) plus consumables (Super Likes, SuperSwipes, Spotlights, Notes, Roses, Boosts) [1][5][6][10].
- **What is gated:** seeing who liked you, unlimited likes, undo, advanced filters, location change and priority visibility [5][6][10]. Core safety tools appear free in the sources read [2][7].
- **Prices** vary by market and change often:
  - A secondary source quoted about $24.99, $39.99 and $49.99 a month for Tinder's three tiers in March 2026, market unstated [5].
  - Hinge in India was reported at ₹1,199 a month for Hinge+ and ₹1,499 a month for HingeX [14].
  - A 2022 study across six countries, including India, found Tinder charged older users substantially more. Tinder said it would end age-based pricing by the end of Q2 2022 [20], but a 2026 secondary source still describes age-dependent prices [5]. That conflict is unresolved.
- **Results:**

  | business | revenue | payers | revenue per payer |
  | --- | --- | --- | --- |
  | Match Group, Q3 2026 | $891.2M (−3%) | 13.8M (−5%) | $21.19 [16] |
  | Tinder, Q3 2026 | $480M (−2%) | 8.9M (−4%) | $18.02 [16] |
  | Hinge, Q3 2026 | $220.6M (+19%) | 2.3M (+23%) | $31.81 [16] |
  | Bumble Inc., Q2 2026 | $210.5M (−15.2%) | 3.16M (−16.4%) | $27.55 (Bumble app) [9] |

  Tinder's daily active users returned to year-over-year growth in September 2026, the first time in about three and a half years [15].
- **Read:** intent-led, curated products are gaining payers, while volume swiping with heavy paywalls is losing them. In India, 5–15% of monthly users typically upgrade [21].

## India context (input for the launch decision)

- **Market:** Indian online dating is projected at ₹2,000–2,500 crore by 2030, growing 12–14% a year [21].
- **Users:** about 26% of users on Indian dating platforms are women [21].
  - Intent leans toward serious relationships, with families acting as "co-pilots".
  - Growth is coming from tier-2 and tier-3 cities.
  - Trust and authenticity are the top concerns, deepfakes included.
  - Women get too much attention while men struggle to be seen.
- **Competitors:** Tinder, Bumble and Hinge compete with Aisle, QuackQuack, TrulyMadly and others [21].
  - India is Hinge's second-largest market by downloads and registrations, and third by monthly active users [14].
  - Tinder's Face Check is already mandatory for new Indian users [3].
- **Regulation:** the DPDP Rules were notified on 2025-11-13 [22].
  - Most fiduciary obligations apply from 2027-05-13.
  - A detailed breach report is due to the Data Protection Board within 72 hours.
  - Some logs must be kept for at least one year.
  - Anyone under 18 is a child, and processing a child's data needs verifiable parental consent.
  - Being 18+ only therefore makes age assurance a compliance question as well as a safety one.

## Inferred data model (for replica-architect)

```
User           id, contact (email/phone), birthdate, status (active/paused/banned/deleted)
               evidence: S01-S02, S12, S14            confidence: high
Profile        user_id, display name, bio, gender, intentions (<=2), interests
               evidence: S04, [8]                      confidence: high
Photo          profile_id, position, verified flag, moderation state
               evidence: S03-S04, [3][8]               confidence: high
PromptAnswer   profile_id, prompt_id, text or voice, feedback rating
               evidence: S04, [12]                     confidence: medium
Preference     user_id, age range, distance, genders, (paid) advanced filters
               evidence: S12, [10]                     confidence: high
Like           from_user, to_user, target item (photo/prompt), comment, priority flag
               evidence: S06-S07, [10][13]             confidence: medium
Pass           from_user, to_user, undone_at           evidence: S05, [5][6]   confidence: medium
Match          user_a, user_b, created_at, expires_at (timed variant), closed_at
               evidence: S08, [6][11]                  confidence: medium
Message        match_id, sender, body or media, safety flags, read_at
               evidence: S09, [2][7]                   confidence: high
Block / Report / ModerationAction  reporter, subject, reason, status, actor
               evidence: S10, [2][7]                   confidence: high
Verification   user_id, type (liveness/ID), result, face template (vendor-held?)
               evidence: S03, [3]                      confidence: medium
Entitlement / ConsumableBalance  user_id, tier, item counts, renewal
               evidence: S13, [6][10]                  confidence: high
```

Relationships: User 1-1 Profile, Profile 1-n Photo and PromptAnswer; a Match
pairs two users and owns Messages; Blocks override everything else.

## Feature matrix

See `features.csv` (updated with the positioning in stage 3).

## Out of scope (cannot or should not be cloned)

- Their member networks and user data. Partner integrations (Spotify,
  Duolingo, Beli [4]). Their proprietary AI models and verification vendors.
  Their brands, names, illustrations, copy and UI artwork.
- Practices we will not copy: attribute-based personalized pricing [20];
  undisclosed guarantee terms, hard cancellation and lockouts after billing
  disputes [17].

## Size

Screens 14, flows 9, entities 12. Hard parts: atomic matching under
concurrency; real-time messaging with server-side authorization; safe media
handling and moderation; honest verification (an age gate is not age
verification); coarse location without inference; deletion across stores.
Size: **L** (a quarter) for a production-ready MVP with its safety features.
Adding verification vendors, payments and native polish makes it **XL**.

## Uncertainties and gaps

- Nothing was observed first-hand: screens and flows are inferred, and click counts are unknown.
- Tinder's tier contents rely on a secondary source [5], because the official table did not render [1].
- Prices change frequently. Indian prices for Tinder and Bumble were not found.
- Bumble's Q3 2026 results had not been found at research time; Q2 2026 is used [9].
- Complaint evidence is mostly U.S. survey data (2023, 2024). There is no India-specific complaint dataset, and no review corpus yet (decision D004). See `feedback.md`.
