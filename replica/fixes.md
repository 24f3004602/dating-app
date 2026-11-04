# Fixes, positioning and MVP

Date: 2026-11-04. Method: replica-entrepreneur steps 3-5, adapted (decision
D004). H1-H7 refer to `feedback.md`; [n] refers to the sources in `recon.md`.
**Every A-item is an assumption to validate**; nothing here is final until the
owner agrees (status `provisional` in `decision-log.md`).

## Target audience (A1)

**Primary:** single adults aged 22-34 in Indian metros and fast-growing tier-2
cities.
- They want a serious relationship, use English and Hindi, and are tired of
  volume swiping.
- **Design for women's comfort first.** Women are about 26% of users on Indian
  dating apps and get excess attention [21] (H4). If women stay, the network
  works for everyone.
- Inclusive of all genders and orientations, with privacy for people who are
  not out (H1; [2][14]).

**Not at launch:**
- under-18s, who are blocked
- hook-up-first use
- parent-run matrimony accounts
- the diaspora

## Launch market (A2)

**India, one metro first: Delhi NCR.**
- **One city:** a dating app only works if enough eligible people are nearby, so
  liquidity must come before reach.
- **India:**
  - demand for intentional dating (India is Hinge's #2 market [14])
  - a serious-intent culture [21]
  - a visible trust gap [21]
  - the owner's Razorpay plan
- **Delhi NCR:** it is where the owner is based, which helps local launch work.
- **Regulation:** we design for DPDP obligations now, although its core
  obligations bind from 2027-05-13 [22].

## Three angles (replica-entrepreneur step 5)

- **A. Intent-first.** For Indians aged 22-34 who are exhausted by endless swiping that goes
  nowhere, the app shows a small daily set of people whose intentions match
  yours. It caps unanswered chats so matches actually talk. *Evidence:* H3
  (78% burnout, n = 1,000, U.S.), H6, and Hinge payers up 23% [16].
- **B. Safe by default.** For women who are flooded and harassed on mainstream
  apps, the app controls who can reach them, filters harm before it lands, and
  never charges for safety. *Evidence:* H1 (38% overall; 56% of women under 50),
  H4.
- **C. Priced fairly.** For people who feel tricked by dating-app billing, the
  app publishes one price per plan, does not sell visibility, and cancels in a
  few taps. *Evidence:* H5 (FTC, $14M), H7 (thin).

**Recommended: A, with B and C as non-negotiable product rules.**
- A is the clearest reason to switch, and it matches where the market is
  moving [14][16][21].
- B is table stakes done better [3][7].
- C builds trust cheaply, but it gives up boost revenue (see `launch/pricing.md`).

Draft line: *Fewer, better matches with people who want the same thing:
verified honestly, safe by default, priced fairly.*

## Differentiation

| # | what we do | how the three differ | evidence | MVP? |
| --- | --- | --- | --- | --- |
| 1 | Intent is required and matched both ways: each person must fit the other's intent and preferences | intent badges are optional (Bumble) [8] | H3; 77% want to know intentions [8] | yes |
| 2 | Finite daily set (for example 15 profiles); deterministic, explainable ranking | endless decks; paid "see more" | H3 | yes |
| 3 | Equal daily like limit for everyone, never sold | unlimited likes are a paid feature [5][6][10] | H4, H7 | yes |
| 4 | Cap on chats waiting for your reply | Hinge has a similar cap [11] | H6 | yes |
| 5 | Every safety tool free; no paid visibility at launch | boosts and priority are sold [5][6][10] | H1, H7 | yes |
| 6 | Honest verification labels that show only checks we actually ran ("age declared", "email verified") | badges can imply more than was checked | owner principle | yes |
| 7 | Discreet by default: city-level location with distance buckets, and notifications without names or message text | — | H1; privacy in India [14] | location yes; notifications later |
| 8 | One published price per plan per market, easy cancel, no lockout over disputes | dynamic pricing [5][20]; FTC case [17] | H5 | with payments |
| 9 | English and Hindi | English-first | [21] | i18n-ready in MVP; Hindi before public launch |

## Fix plan (replica-entrepreneur step 4)

| fix | what we build | size | stage | evidence |
| --- | --- | --- | --- | --- |
| Harassment | block, report and unmatch enforced everywhere; keyword nudge before sending; report status; moderation targets | M | 10-11 | H1 |
| Fakes and scams | email verification, rate limits and duplicate-signal checks in MVP; liveness vendor next | M | 6, post-MVP | H2 |
| Burnout | finite daily set; reciprocal intent filter | S | 8 | H3 |
| Imbalance | equal daily like limit; likes can carry an optional comment | S | 8-9 | H4 |
| Ghosting | configurable cap on chats awaiting your reply | S | 9-10 | H6 |
| Billing trust | one price; cancel in at most 3 taps; renewal reminders | M | 16 | H5 |

## MVP scope

Rows with priorities are in `features.csv`.

**In (must):**
- Sign-up and account:
  - adult age gate (declared, labelled honestly)
  - email registration with a one-time code
  - login, sessions, logout and recovery
- Profile: profile with a required intent; 2-6 photos with safe processing;
  visibility setting.
- Location: city-level only, with distance buckets.
- Discovery:
  - preferences
  - reciprocal eligibility filtering before deterministic ranking
  - a finite daily set
  - like and pass with an equal daily limit
- Matching and chat: atomic mutual match; persistent text chat with real-time
  delivery, unread counts and history.
- Safety: block, unmatch, report with status; a moderation queue with roles
  and an audit trail.
- Privacy: discovery pause; account deletion under the retention policy;
  honest verification labels.
- Web: protected admin console.

**In (should):**
- text prompts
- likes with an optional comment
- the your-turn cap
- a keyword nudge before sending
- a static safety center
- the landing page
- i18n-ready strings

**Deferred:**
- Verification and sign-in: liveness or photo verification (vendor); phone
  sign-up by SMS (needs India DLT registration); ID or age verification
  provider.
- Contacts and chat: hiding from contacts; images in chat.
- Engagement: push notifications; undo a pass; travel mode.
- Business and advanced: the single paid plan; AI matching; calls; advanced
  analytics.

**Skip:**
- paid visibility boosts (at launch)
- events and group hangouts
- partner integrations
- attribute-based pricing

## Success criteria (A3)

Targets to validate in a single-city beta. Measured weekly from
privacy-preserving aggregates.

| area | metric | target |
| --- | --- | --- |
| activation | sign-ups completing a profile (2+ photos, intent) within 24 h | ≥ 60% |
| liquidity | new users with 1+ match within 7 days | ≥ 30% |
| conversation | matches with a first message within 48 h | ≥ 50% |
| conversation | matches reaching 4+ messages, at least 2 from each side | ≥ 35% |
| balance | women's share of weekly active users | ≥ 35% (India baseline about 26% [21]) |
| retention | day-7 / day-30 return rate | ≥ 25% / ≥ 12% |
| safety | median time from report to first moderator action | < 24 h (< 4 h for severe reports) |
| safety | blocked users who can still see or message the blocker | 0 (tested on every path) |
| safety | women who say they feel safe (in-app survey) | ≥ 80% |
| honesty | badges shown for checks not performed | 0 (audited) |
| privacy | precise-location exposures to other users | 0 (tested) |
| privacy | deletion requests completed | ≤ 7 days, inside the DPDP 90-day grievance limit [22] |
| reliability | crash-free sessions; message delivery success | ≥ 99.5%; ≥ 99.9% |
| monetization (later) | paying share of monthly users; refund and chargeback rate | 3-8% (India norm 5-15% [21]); < 1% |

## Assumptions to validate

| ID | assumption | how to check |
| --- | --- | --- |
| A1 | 22-34 serious daters in Indian metros are the right first audience | 15-20 interviews; landing-page waitlist split by intent |
| A2 | Delhi NCR can reach a viable local density | waitlist size per locality before opening |
| A3 | The targets above are realistic | revise after 4 weeks of beta data |
| A4 | Email-first sign-up is acceptable for a beta, though Indians expect phone codes | sign-up drop-off; add SMS when DLT registration is done |
| A5 | Users prefer a finite daily set to an endless deck | beta retention and qualitative feedback |
| A6 | An equal like limit improves like quality without hurting liquidity | like-to-match rate; women's retention |
| A7 | Pricing hypotheses in `launch/pricing.md` | sequential price tests after MVP |
| A8 | Provisional names in `brand.md` are usable | trademark and domain checks (to run) |
