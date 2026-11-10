# Product: the member app

<!-- impeccable:product-schema 1 -->

The member app's record for design work (D100), confirmed by the owner on 2026-11-10.
The root `PRODUCT.md` is the full shared record. Impeccable reads only this file inside
`apps/mobile` (a child record replaces the root's), so the shared rules design depends on are
repeated here in short: change both files together.

## Platform

android

## Users

Single adults aged 22-34 in Indian metros, Delhi NCR first, who want a serious relationship and are tired of volume swiping; they use English and Hindi. Women's comfort comes first; inclusive of all genders and orientations, with privacy for people who are not out. Under-18s are blocked.

## Product Purpose

Where members meet, decide and talk: today's introductions, a person's profile, likes received, matches, chat, safety, privacy and settings. Success is a match that becomes a two-sided conversation, by members who feel safe.

## Positioning

- Intent is required and matched both ways; about 15 introductions a day, a new set each day on India time, with explainable ranking; a cap on chats waiting for your reply.
- Every safety tool is free; photos are reviewed before anyone sees them; location is an area and a distance bucket, never precise.
- An equal daily like limit (10) for everyone, never sold; no paid visibility.
- Honest labels: only checks actually run ("age declared", "email verified"); identity "not checked".

## Operating Context

- **Android first** (owner, 2026-11-10): Android's conventions (system back, gestures, system text size, safe areas, edge-to-edge) with the same look on the web build; iOS adjustments when iOS ships via TestFlight.
- The same Expo codebase is served on the web at app.kinaara.online during the closed beta, so every screen must also work with a mouse, a keyboard and a screen reader in a browser.
- Mostly one-handed, in short sessions, often on mobile data.

## Capabilities and Constraints

- React Native with Expo Router; motion only with React Native's own Animated (no new native libraries without the owner's go, D098); accessible primitives in `src/ui/primitives.tsx`; tokens in `src/theme/tokens.ts`, kept equal to `replica/design/tokens.json` by a test.
- The app's CSP (`infra/beta/app-csp.txt`) allows fonts only from its own origin and data URLs.
- Every screen has empty, loading, error and filled states; the web e2e suite with axe runs on each change.

## Brand Commitments

- Working name Kinaara ("shore"), provisional and configurable (`BRAND_NAME`): never baked into images.
- Calm and honest: no urgency, countdowns, streaks, confetti or gamification (D098).
- No people in visuals (D099). Never manufacture likes, matches, messages, members, badges or activity.

## Evidence on Hand

- Assets: the two-ring mark (`src/ui/Rings.tsx`), the candlelight loop and stills (served from the website's `/media`, D099).
- Absent, never to be fabricated: members, testimonials, ratings, usage numbers.

## Product Principles

1. Fewer, better: finite sets and calm pacing over volume.
2. Safety and privacy are never paid features.
3. Honest by construction.
4. Women's comfort first; inclusive of everyone.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast checked by script, 48-point targets, visible focus, screen-reader labels, reduce motion followed everywhere, pause controls for motion longer than 5 seconds; English now, Hindi (Devanagari) before public launch. Plus TalkBack on Android (not yet tested on a device: NAT-1) and the system font scale up to 200%.
