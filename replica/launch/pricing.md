# Pricing hypotheses (not decisions)

Date: 2026-11-04. replica-launch step 2, adapted. Prices change, so every
price carries the date it was read. [n] refers to `recon.md` sources.
Payments ship in stage 16, in sandbox only, after the MVP is stable.

## What the market charges

| app | plans | price seen | source |
| --- | --- | --- | --- |
| Hinge (India) | Hinge+, HingeX | ₹1,199 and ₹1,499 per month | [14], reported 2026-09 |
| Tinder | Plus, Gold, Platinum | about $24.99, $39.99 and $49.99 per month; market not stated; varies by age and location | [5], secondary, 2026-03 |
| Bumble | Boost, Premium, Premium+ | not found | [6] |

Revenue per payer per month (global):

| app | revenue per payer |
| --- | --- |
| Tinder | $18.02 [16] |
| Hinge | $31.81 [16] |
| Bumble app | $27.55 [9] |

In India, 5-15% of monthly users typically pay [21].

## What users said about price and billing

- **H5:** cancellation, guarantee terms and lockouts after disputes [17]; age-based price differences, including in India [20].
- **H7:** being paid to be seen (thin). No India-specific billing complaints have been collected yet.

## Principles (from `fixes.md`)

1. **Free for everyone:** safety, and the whole core loop (profile, daily set, likes within the equal limit, matches, chat).
2. **One price for everyone:** a single published price per plan per market, with no prices based on age, gender, device or behaviour.
3. **No paid visibility at launch:** no boosts, priority placement or "skip the line".
4. **Easy exit:** cancel in-app in at most 3 taps, a reminder before each monthly-or-longer renewal, and no account lockout over billing disputes.

## Hypotheses to test

| # | hypothesis | how to test | success signal |
| --- | --- | --- | --- |
| P1 | A single paid plan converts better than tiers in India, at ₹299-₹499 a month (about 25-40% of Hinge+'s India price) | one price live at a time per market, tested sequentially (no per-user price A/B, to keep principle 2) | 3%+ of monthly users pay; refunds under 1% |
| P2 | People pay for convenience, not safety: see everyone who liked you at once (free users see one at a time), more daily profiles, advanced filters, travel mode, undo | feature-level willingness-to-pay survey; paywall-view to purchase rate | 2+ features each cited by more than 30% of payers |
| P3 | An equal daily like limit that is never sold improves like quality, and women stay longer | compare like-to-match rate and women's 30-day retention against the beta baseline | like-to-match rate up; women's retention not down |
| P4 | A one-week pass (₹99-₹149) suits price-sensitive users without hurting monthly plans | offer it after the monthly plan exists | weekly buyers return; monthly share stable |
| P5 | An annual plan priced at 10 times monthly sells to engaged users | offer it after 60 days of beta | 15%+ of payers choose annual |
| P6 | No consumables at launch loses little revenue and keeps trust | revisit with data at 6 months | — |

## Billing rules (checked 2026-11-05, stage 16b; public sources, not legal advice)

**iOS (Apple App Store Review Guidelines, read 2026-11-05; the page shows no date):**
- 3.1.1: features unlocked inside the app, including subscriptions, "must use in-app purchase".
- 3.1.1(a): outside the United States storefront, apps "may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase". External-purchase entitlements exist only for specific storefronts, and the guidelines name none for India.
- 3.1.3(b), multiplatform: something bought on our website may be used in the iOS app only if it is also sold there as an in-app purchase.
- 3.1.2: auto-renewing subscriptions must last at least 7 days, give ongoing value, and say clearly what the price buys.
- **For us:** in the iOS app, the plan is sold only through in-app purchase, and the app never mentions the web price.

**Android (Google Play Console Help, "Understanding user choice billing on Google Play", read 2026-11-05):**
- Google Play Billing is required for digital features, as Play's payments policy says.
- India has user-choice billing: an alternative billing system offered alongside Play Billing, "for gaming & non-gaming mobile or tablet apps with users in India". The APIs have been available since 2023-11-14.
- The service fee is "reduced by 4%" when users pay through the alternative.
- Enrolment is through the Play Console.
- **For us:** Play Billing in the app; Razorpay as the user-choice alternative is possible later, after enrolment.

**Web (Razorpay docs, read 2026-11-05; the pages show no dates):**
- Subscriptions are available in India, through cards (tokenised under RBI rules), UPI AutoPay and eMandate.
- States: created, authenticated, active, pending (a charge failed and is being retried), halted (retries exhausted), paused, cancelled, completed, expired. "Once cancelled, a Subscription cannot be restarted."
- Webhook events: `subscription.authenticated`, `.activated`, `.charged`, `.completed`, `.updated`, `.pending`, `.halted`, `.cancelled`, `.paused`, `.resumed`.
- Webhooks are signed: `X-Razorpay-Signature` is an HMAC-SHA256 of the **raw** body under the webhook secret ("Do not parse or cast the webhook request body").
- Duplicates are expected, and are deduplicated by `x-razorpay-event-id`. Events can arrive out of order.
- Test mode needs a public webhook URL, so localhost is refused: a staging server, stage 17.
- **For us:** the web is the only place we take payment ourselves, for members who come to the website.

**What this means for one plan:**
- **Three billing systems feed one entitlement on our server:** Razorpay on the web, App Store in-app purchase on iOS, Play Billing on Android. Each needs the owner's accounts (Razorpay with KYC, Apple Developer, Play Console) and server notifications from each.
- **Store fees** apply to in-app sales; the web keeps more but reaches fewer people.

Still to check:
- GST and invoicing;
- Indian consumer-protection rules on auto-renewal and cancellation;
- refunds;
- the current store commission rates for India.

**Recommendation (D094):**
- **No paid plan during the beta.** The core loop is free by principle 1, and P1 is a post-beta test.
- **Stage 16b builds the server side:** a payment-provider interface, the Razorpay adapter with signed and deduplicated webhooks, and a server-side entitlement. All of it is tested against Razorpay's documented formats with our own secret, in sandbox code only.
- **The entitlement unlocks nothing until the owner chooses what the plan includes** (P2) and its price (P1).
- **Later, with the owner's accounts:** in-app purchase and Play Billing, and user-choice billing on Android.

## Sanity check (illustrative only)

10,000 monthly users × 5% paying × ₹399 is about ₹2.0 lakh a month gross. That
is before store fees and GST: Google keeps 15% of auto-renewing subscriptions sold in the Play
app in India (Play Console Help, "Service fees", read 2026-11-24); Apple's rate is still to be
verified. The launch's own costs are in `launch-plan.md`, section 6. **The model
only works at much larger scale.** Density in one city comes first;
monetization comes after the MVP proves the loop.

## The plan, as built (2026-11-18, stage 23a, D124)

- **The owner's rule:** every member's first 5 Live calls are free, up to a minute each; after that, Live comes with the plan.
- **What it brings:** Live calls after the free ones, and calls up to 10 minutes. Nothing else: it never changes who sees whom or the equal like limit (principles 1-3).
- **Its name:** "{brand} Plus" (BRAND_NAME).
- **Its price:** whatever the owner sets on the Razorpay plan; the apps read it from Razorpay, so the price shown is the price charged. **Recommendation:** ₹299 a month, tax-inclusive (P1's low end). A weekly pass (P4) can follow as a second plan later.
- **Where:** Razorpay's own page, from the web app and direct-download Android builds. Store builds: in-app purchase and Play Billing first (Apple 3.1.1; Play's payments policy).
- **Easy exit (principle 4):** Stop renewing in the app, one tap and a confirmation, keeping what was paid for.
- **Cost side:** the relay is the only per-call cost. Cloudflare Realtime: 1,000 GB a month free, then $0.05 per GB (read 2026-11-18). A one-minute call at about 1 Mbit/s each way relays roughly 15 MB, so about 60,000 such calls a month fit the free tier.

## The pass, paid by UPI (2026-11-19, stage 23c, D127)

The owner chose to sell Plus as a pass paid by UPI straight to the owner, instead of a gateway (YouPI-PG can't be used: a "Commercial" licence, and its own README says it isn't for real payments; Razorpay charges 2% plus 18% GST on UPI and needs KYC, and stays in the code for later).

- **What:** {brand} Plus for `PLUS_PASS_DAYS` days (30) for `PLUS_PRICE_INR` (₹299, the recommendation above). It never renews: members buy another pass when they want more, and its days follow the current one's.
- **How members pay:** the Plus screen gives the exact amount, the owner's UPI ID and a code for the note, as a link that opens their UPI app filled in (on the web, also as a QR code); they pay and type the 12-digit UPI reference. **The owner (an admin) approves each payment** in the console's Payments page after finding it in the bank; the pass starts at once.
- **Costs:** no fees for UPI payments to the owner's own account. The owner's time per sale: finding the reference in the bank app and one click.
- **Fair and honest:** the price shown is what is paid; no auto-renewal to forget; nothing else changes with Plus (principles 1-4).
- **Refunds (a proposal in the terms, the owner's to change):** payments that can't be confirmed, wrong amounts and repeated payments are refunded to the account they came from within 7 working days; if the test or Live ends while a pass runs, the days left are refunded; otherwise a pass that has started isn't refundable, and it ends with the account.
- **A business UPI ID** (from the owner's bank, or a free merchant account such as PhonePe Business or Paytm for Business) works best: community reports say some UPI apps refuse link payments to personal UPI IDs. The screen also shows the UPI ID for paying by hand.
- **Later:** with more members, Razorpay (already built, D124) confirms payments without the owner's clicks and can renew.
