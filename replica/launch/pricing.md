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

## Billing rules to verify before stage 16 (not yet checked)

- **Mobile app stores:** digital features sold inside the iOS and Android apps must use Apple In-App Purchase and Google Play Billing. Verify Google Play's user-choice billing option for India, its fees and eligibility, and Apple's current rules for India.
- **Web:** Razorpay for web purchases where store rules allow. The app must never steer users in ways the store rules forbid.
- **Tax and consumer terms:** confirm GST treatment, invoicing, refund handling and the Indian consumer-protection rules on auto-renewal and cancellation.

## Sanity check (illustrative only)

10,000 monthly users × 5% paying × ₹399 is about ₹2.0 lakh a month gross. That
is before store fees (roughly 15-30%) and GST, both to be verified. **The model
only works at much larger scale.** Density in one city comes first;
monetization comes after the MVP proves the loop.
