---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Landing page (kinaara.online)

## Scope and mode

Persuade. The public landing page of the website (`apps/web/app/page.tsx`), phone first, also desktop. The privacy and terms pages and the staff console are out of scope.

## Audience, job, action

- Visitors deciding whether to join, mostly on phones in Delhi NCR; invited testers checking the notice.
- Primary action: **join the waitlist** (email only, double opt-in, owner's choice 2026-11-10). The page ships only after the waitlist backend exists (stage 20c).
- Proof: only mechanisms the app already enforces and tests check (intent both ways, up to 15 a day, 10 likes for everyone, the 5-waiting pause, free safety tools, honest labels, vague location, deletion in 7 days). No members, numbers, reviews or press: there are none.
- Copy is rewritten for this direction with the same facts and no new claims; the owner reviews the words before it ships.
- Constraints: fonts self-hosted (`font-src 'self'`); no people in visuals; reduce motion and a pause for anything moving longer than 5 seconds; WCAG 2.2 AA; Devanagari beside Latin; light on mid-range phones and data saver.
- Avoid (owner): too quiet or plain.

## Chosen direction

The Interchange: Delhi Metro-style wayfinding in our own colours. Memorable moment: your line and someone else's meet at an interchange drawn as the two rings, only where both fit.

## Unresolved

- The final name (Kinaara is provisional); the name stays configuration, never baked into images.
- Hindi copy needs a native reviewer before it ships. **Done 2026-11-13:** the owner, a native Hindi speaker, kept all 16 lines (`replica/launch/hindi-review.md`).

## Direction contract

THESIS: The page is a route map of how introductions work: your line and another person's meet at an interchange only when intentions fit both ways, and the day's line has 15 stations, not an endless track. It refuses the category's swipe-card phone mockup and gradient, and the calm cream page.

OWN-WORLD: White enamel ground with graphite sign bands owning the top and the close; two line colours, peacock teal (yours) and marigold (theirs), drawn as thick route lines with white station roundels outlined in graphite; the two-ring mark as the interchange symbol and the fixed crest. Anek (Latin and Devanagari, OFL, self-hosted): semi-condensed bold for signs, normal width for text; every sign bilingual where it names a place or a rule. Rectangular sign-plate buttons, a marigold focus ring, no pills, no gradients, no glow.

STORY: The visitor sees in one screen that this is a short daily set matched both ways, then reads each rule as a station on the line, believes it because every station states how it's enforced, and joins the waitlist at the first screen or at the last stop.

FIRST VIEWPORT: Phone: a graphite sign band with the rings and KINAARA / किनारा; a teal and marigold strip; the headline at full width; the route diagram below it, teal entering left, marigold right, meeting at the ring interchange labelled "Fit both ways / दोनों तरफ़ से"; a graphite "Next stop: Delhi NCR" panel at the bottom with the email field and the Join the waitlist plate. Desktop: the sign band across the top; headline and the waitlist panel in the left column; the route diagram large on the right.

FORM: Delhi Metro wayfinding, position 1 on the ordered list (impeccable's pick, chosen by the owner over the roll's assignment, candidate 7). Signature interaction: as the visitor scrolls, the teal line draws down the page station by station and the marigold line joins at the interchange; with reduced motion the full line is drawn at once. seed:366e93b948f4624b

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
