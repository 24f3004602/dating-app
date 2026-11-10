# Product

<!-- impeccable:product-schema 1 -->

The product record for design work (impeccable, D100), confirmed by the owner on 2026-11-10.
Sources with evidence and dates: `replica/fixes.md` (audience, positioning, success),
`replica/brand.md` (name), `replica/decision-log.md`. The member app's platform is in
`apps/mobile/PRODUCT.md`.

## Platform

web

## Users

- **Members:** single adults aged 22-34 in Indian metros and fast-growing tier-2 cities, launching in Delhi NCR first. They want a serious relationship, use English and Hindi, and are tired of volume swiping.
- **Women's comfort comes first.** Women are about a quarter of users on Indian dating apps and get excess attention; if they stay, the network works for everyone.
- Inclusive of all genders and orientations, with privacy for people who are not out.
- **Not served:** under-18s (blocked at sign-up); not at launch: hook-up-first use, parent-run matrimony accounts, the diaspora.
- **Visitors to the website:** people deciding whether to join, and testers checking the beta notice, terms and privacy.

## Product Purpose

Fewer, better introductions with people who want the same thing: verified honestly, safe by default, priced fairly.

Success is measured in a single-city beta (`replica/fixes.md`, A3): profiles completed within 24 h, a first match within 7 days, matches that turn into two-sided conversations, women at 35% or more of weekly active members, women who say they feel safe, reports acted on within 24 h, and zero badges for checks not performed.

## Positioning

- **Intent-first:** intent is required and matched both ways. Each person must fit the other's intent and preferences.
- **A finite daily set:** about 15 introductions a day, with deterministic, explainable ranking; a new set each day, on India time. A cap on chats waiting for your reply, so matches actually talk.
- **Safe by default:** every safety tool is free; block, report and unmatch everywhere; photos are reviewed before anyone sees them; location is an area plus a distance bucket, never precise.
- **Priced fairly:** an equal daily like limit (10) for everyone, never sold; no paid visibility; one published price per plan and easy cancelling, when payments exist.
- **Honest labels:** only checks actually run are shown ("age declared", "email verified"); identity is "not checked" until a real check exists.

## Operating Context

- Members mostly use phones, often on mobile data and with data saver on. The member app is served on the web (app.kinaara.online) during the closed beta; an Android build comes next.
- The daily rhythm: a set of introductions each morning, likes with an optional note, a match, then chat.
- A closed, invite-only beta is running (since 2026-11-06); the public site says it isn't open yet. Testers sign up with the address they were invited with.
- The website (kinaara.online) holds the landing page, the tester notice, terms and privacy.

## Capabilities and Constraints

- **Codebases:** the website is Next.js (`apps/web`); the member app is one Expo codebase for Android and the web (`apps/mobile`); a FastAPI backend.
- **Implemented:** sign-up with an age gate, email codes, profiles and photos, preferences, the daily set, likes and passes, mutual matches, chat with live updates, block, report, unmatch, safety screen, privacy and pause, account deletion with a 7-day restore, discreet notifications.
- **Strict content security policies** on both: scripts, styles, images, media and fonts from our own origins only (`font-src 'self'`). A new third-party request (fonts, images, scripts, analytics) needs a privacy-inventory entry and a CSP change; there are none today.
- **Performance:** Indian mobile networks and mid-range phones; data saver and slow connections are respected (the video falls back to a still).
- **The name is provisional and configurable** (`BRAND_NAME`); designs must not bake the name into images.
- **Hindi before public launch:** layouts and type must hold Devanagari as well as Latin.
- **Undecided:** the final name and logo; payments and pricing (deferred); iOS.

## Brand Commitments

- **Working name: Kinaara** ("shore" in Hindi and Urdu), not yet cleared (trademark search pending).
- **Calm and honest:** no urgency, countdowns, streaks, confetti or other gamification (D098).
- **No people in visuals:** stock with people would imply members who don't exist, and stock licences bar people in dating promotion (D099).
- **Never manufacture** likes, matches, messages, members, verification badges or activity, in product or in marketing.

## Evidence on Hand

- **Real assets:** a people-free candlelight loop with stills (`apps/web/public/media`, D099); the two-ring mark (`apps/mobile/src/ui/Rings.tsx`); the shoreline drawing (`apps/web/app/HeroBackdrop.tsx`).
- **Research:** public reviews and studies on swipe fatigue, harassment and billing (`replica/recon.md`, `replica/feedback.md`, `replica/fixes.md`), with sources.
- **Absent, never to be fabricated:** members, testimonials, ratings, press, match or usage numbers, partner logos.

## Product Principles

1. Fewer, better: finite sets and calm pacing over volume.
2. Safety and privacy are never paid features.
3. Honest by construction: labels and claims only for what was actually done.
4. Women's comfort first; inclusive of everyone.
5. Fair, published prices; nothing that sells attention.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast checked by script, 48-point touch targets, visible focus, labels for screen readers, reflow at 320 px, reduce motion followed everywhere, pause controls for anything moving longer than 5 seconds.
- English now, Hindi before public launch; all genders and orientations.
