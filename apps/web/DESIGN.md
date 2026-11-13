---
name: Kinaara (website)
description: The Interchange, metro wayfinding for fewer, better introductions
colors:
  line-you: "#0e6670"
  line-you-pressed: "#08535a"
  line-them: "#f5b544"
  line-them-hover: "#f7c467"
  line-them-pressed: "#e9a632"
  sign-graphite: "#1c1b19"
  enamel-white: "#ffffff"
  ink-muted: "#5c5852"
  on-sign-muted: "#d6d2cb"
  error-on-sign: "#ffb0a3"
typography:
  display:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 3.6vw + 1.6rem, 5rem)"
    fontWeight: 760
    lineHeight: 0.98
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 87.5"
  headline:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.6vw + 1.25rem, 2.75rem)"
    fontWeight: 750
    lineHeight: 1.05
    fontVariation: "'wdth' 87.5"
  title:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1vw + 1.25rem, 2rem)"
    fontWeight: 700
    lineHeight: 1.1
    fontVariation: "'wdth' 87.5"
  sign:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 0.6vw + 1.1rem, 1.625rem)"
    fontWeight: 700
    lineHeight: 1.15
    fontVariation: "'wdth' 87.5"
  wordmark:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 87.5"
  lede:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 0.4vw + 1rem, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  small:
    fontFamily: "Anek, Nirmala UI, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  plate: "0"
  roundel: "50%"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
components:
  button-plate:
    backgroundColor: "{colors.line-them}"
    textColor: "{colors.sign-graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "0 1.5rem"
    height: "3rem"
  button-plate-hover:
    backgroundColor: "{colors.line-them-hover}"
  button-plate-active:
    backgroundColor: "{colors.line-them-pressed}"
  button-plate-disabled:
    backgroundColor: "{colors.on-sign-muted}"
  direction-sign:
    backgroundColor: "{colors.line-you}"
    textColor: "{colors.enamel-white}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 1rem"
    height: "3rem"
  direction-sign-hover:
    backgroundColor: "{colors.line-you-pressed}"
  station-plate:
    backgroundColor: "{colors.sign-graphite}"
    textColor: "{colors.enamel-white}"
    typography: "{typography.sign}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 0.875rem 0.5625rem"
  status-plate:
    backgroundColor: "{colors.line-them}"
    textColor: "{colors.sign-graphite}"
    rounded: "{rounded.plate}"
    padding: "0.25rem 0.75rem"
  input-on-sign:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.sign-graphite}"
    rounded: "{rounded.plate}"
    padding: "0 0.75rem"
    height: "3rem"
  sign-panel:
    backgroundColor: "{colors.sign-graphite}"
    textColor: "{colors.enamel-white}"
    rounded: "{rounded.plate}"
    padding: "1.5rem"
  sign-band:
    backgroundColor: "{colors.sign-graphite}"
    textColor: "{colors.enamel-white}"
    padding: "0.75rem 1.5rem"
---

# Design System: Kinaara (website)

Scope: the public website's Interchange world (`app/page.tsx`, `app/landing.module.css`, the waitlist confirm and leave pages). The staff console and the documents (privacy, terms) use `app/globals.css` and are not part of this system. The member app (`apps/mobile`) will carry its own DESIGN.md. Product context is in the root `PRODUCT.md`.

## Overview

**Creative North Star: "The Interchange"**

The website is a metro route map in the brand's own colours. Your line is peacock teal, the other person's is marigold, and they meet at an interchange drawn as the brand's two rings, only where both fit. After the interchange the two rails run on side by side, and each rule of the product is a station on that line. The language is Delhi Metro-style wayfinding: graphite sign bands across the top and the close, enamel sign plates lettered in white, thick route lines and white station roundels outlined in graphite, all on a white enamel ground. DMRC's identity (its logo, line colours and signage artwork) is never copied; the system borrows the grammar of wayfinding, not anyone's marks.

Density is that of signage: big condensed bold names, short plates, generous white ground between stations, body text kept to readable measures. Every sign that names a place or a rule is bilingual, Devanagari under the Latin. The world is loud enough to be remembered (bands, plates, two saturated lines) and calm in its motion: two authored movements, each finished in seconds. On arrival the hero map lifts into relief and their ring hooks through yours, once; then the line draws itself as you travel down the page.

Rejected (confirmed in the direction contract): the category's swipe-card phone mockup and gradients, and the calm cream page. Pills, gradients and glow are out.

**Key Characteristics:**
- Two line colours with fixed meanings: teal is yours, marigold is theirs.
- Graphite sign bands and plates on a white enamel ground.
- Anek throughout: semi-condensed bold (wdth 87.5) for signs, normal width for text.
- Bilingual signs, Devanagari under the Latin.
- Square-cornered plates; the only curves are roundels and the two-ring mark.
- Two authored motions: the hero's interchange hooks once on arrival (3D, about three seconds); the rails draw on scroll.

## Colors

Two saturated line colours carried by graphite and white, like a transit map on an enamel sign.

### Primary
- **Peacock Teal** (line-you): your line. Route rails and the map's left line, the "Towards the waitlist" direction sign, links on the white ground, the caret. Pressed and hover state on the direction sign is **Deep Teal** (line-you-pressed).

### Secondary
- **Marigold** (line-them): their line. The second rail, the waitlist button plate, the "Not open yet" status plate, links on graphite, the inner focus ring, text selection, checkbox accent, the confirmation roundel, and the pressed state of the pause plate. **Light Marigold** (line-them-hover) and **Burnt Marigold** (line-them-pressed) are the plate's hover and active states only.

### Neutral
- **Sign Graphite** (sign-graphite): body text on white, the sign band, the closing band, the waitlist panel, station plates, roundel outlines, the outer focus ring. It is the shared `--color-text` token.
- **Enamel White** (enamel-white): the page ground, lettering on graphite, roundel fill, the input fill inside the graphite panel.
- **Station Grey** (ink-muted): secondary text on white (legend, small map labels).
- **Sign Grey** (on-sign-muted): secondary text on graphite (consent lines, footer, 11.6:1), and the disabled plate.
- **Signal Coral** (error-on-sign): field errors and the invalid input border, on graphite only (9.6:1). The shared danger red is not used in this world because every error appears on a graphite panel.

### Named Rules
**The Two Lines Rule.** Teal always means you and marigold always means the other person. Never swap them, never add a third line colour, and never use them as decoration detached from that meaning (the button plate and focus ring are marigold because they are the step toward someone else).

**The Rails Are Not Text Rule.** Marigold on white is for rails, plates and fills only, never for text on the white ground; marigold text appears only on graphite.

## Typography

**Display Font:** Anek (with Nirmala UI, Noto Sans Devanagari, system-ui)
**Body Font:** Anek, normal width
**Label/Mono Font:** none distinct

**Character:** One self-hosted family (Ek Type, OFL) covers both scripts. Signs set it semi-condensed (font-stretch 87.5%) and bold, the way station names are lettered; running text sets it at normal width so it reads easily on a phone. The Latin file is a variable font (wght 100 to 800, wdth 75 to 125%) and is preloaded; the Devanagari file is a single static instance at wght 650 / wdth 90, declared for every weight and width so the browser never synthesizes bold, and it loads only when a page shows Devanagari. `font-synthesis: none` is set on the world.

### Hierarchy
- **Display** (760, fluid 2.5 to 5rem, 0.98): the first-screen headline only; balanced wrapping.
- **Headline** (750, fluid 1.75 to 2.75rem, 1.05): section headings such as "How it works, stop by stop"; the confirm and leave pages use a 2 to 3rem variant at 1.02.
- **Title** (700, fluid 1.5 to 2rem, 1.1): headings inside graphite panels ("Next stop: Delhi NCR").
- **Sign** (700, fluid 1.25 to 1.625rem, 1.15): station names on enamel plates.
- **Wordmark** (700, 1.75rem, uppercase, +0.04em): the brand name in the sign band; its Devanagari sits beneath at 1.375rem.
- **Lede** (400, fluid 1.125 to 1.375rem, 1.45, max 34ch): the one line under the headline.
- **Body** (400, 1.0625rem, 1.55, max 60ch): station descriptions.
- **Label** (600, 1rem): form labels, legend entries; buttons and plates use 700 at 1.0625rem, semi-condensed.
- **Small** (400, 0.9375rem, 1.5, max 52 to 72ch): consent lines and the footer, in the muted grey of their ground.

### Named Rules
**The Bilingual Sign Rule.** Every sign that names a place or a rule carries its Devanagari directly beneath the Latin, as a block, at 0.875em of the sign's size with line-height 1.2, marked `lang="hi"`. This covers station plates, panel headings and the direction sign. The wordmark and the map labels set their Hindi at their own fixed sizes. Running text is English only. Open item: all Hindi copy is pending a native reviewer before the site goes live; it is not approved copy, and new Hindi must be added to `scripts/devanagari-text.txt` so the subset font contains it.

**The Condensed Means Sign Rule.** Semi-condensed bold is for things that work as signs (names, headings, plates, buttons). Paragraphs are never condensed.

## Layout

Phone first, one column. The page is a sequence: graphite sign band, an 8px strip split half teal and half marigold, the first screen (headline, lede, compact route map, graphite waitlist panel), the line of stations, and a full-width graphite closing band holding the last waitlist panel and the footer. Content is capped at 76rem (the confirm and leave pages and the closing panel at 44rem) and padded 1.5rem at the sides. Spacing uses the shared 4px-based scale (spacing 1 to 7); sections are separated by 3rem, stations by 2rem.

Stations are a list hung on two rails: each rail is 6px (0.375rem) wide with a 3px gap, set 1.25rem from the left edge (1.5rem from 40rem up). The stop roundel (1.625rem) sits across both rails; the interchange stop is the two-ring mark, the terminus a filled graphite roundel.

At 64rem and above the first screen and the route share one two-column grid (1.05fr and 1fr, 3rem gap, 3rem side padding). The headline, lede and panel stack in the left column; the tall route map fills the right column and its joined rails run off its bottom edge into the station rails below. The route's heading, legend and direction sign stick in the left column while the stations scroll on the right.

**The One Geometry Rule.** On desktop the map's joined rails and the station rails share one geometry: centred at 12.5% and 14.75% of the right grid column, each 1.6% of it wide, so the line runs unbroken from the first screen to the last stop. Change one and you must change the other (`RouteDiagram.tsx` and `landing.module.css`).

## Elevation & Depth

Flat. There are no drop shadows, no blur, no gradients and no glow. Depth comes from the ground changing: graphite bands and panels against white enamel, plates sitting on the rails, the roundel's z-order over the rails. The only `box-shadow` in the world is the focus ring's solid 6px graphite outer ring.

**The Enamel Rule.** Surfaces are flat painted planes. Separation is by colour block, never by shadow.

**The Relief Exception.** The hero map's 3D scene (stage 21a, D119) is the same map in relief: the lines' depth shows as walls in a darker step of their own colour, roundels are shallow studs, the rings carry graphite outlines; three flat tones, no shadow, blur or glow. Its face stays exactly where the flat map draws it.

## Shapes

Rectangles with square corners (radius 0) for everything that is a sign: bands, panels, plates, buttons, inputs, the video frame and its pause plate. Circles (50%) only for things that are map symbols: station roundels (white fill, 4px graphite outline), the filled terminus, the two interlocking rings of the interchange and the brand mark, and the small marigold ring that marks a confirmation. Lines are thick and straight, turning through a single rounded bend on the map. Arrows are drawn as inline SVG strokes.

**The Sign Plate Rule.** If it is pressed or read as a sign, it is a rectangle. No pills, no rounded cards.

## Components

### Buttons
Sign plates, not pills.
- **Shape:** square corners (0), at least 3rem tall.
- **Primary (button plate):** marigold with graphite lettering, 0 1.5rem padding, 700 at 1.0625rem, semi-condensed. Used for "Join the waitlist", "Confirm my place", "Remove my address".
- **Hover / Active:** light marigold on hover, burnt marigold on press; the background change eases over 150ms (standard easing) only when motion is allowed. Disabled turns sign grey with a progress cursor and a pending label ("Adding you…").
- **Focus:** a 3px marigold outline at 2px offset inside a 6px graphite ring, the same ring for every focusable element on both white and graphite grounds.
- **Direction sign:** a teal plate with white lettering, an inline SVG arrow and its Devanagari beneath; deep teal on hover. Used for in-page wayfinding ("Towards the waitlist").

### Status plate
A small marigold plate in the sign band, graphite 700 at 0.875rem, semi-condensed ("Not open yet"). It states the service status, as a station sign would.

### Cards / Containers
- **Sign panel:** graphite block, white lettering, 1.5rem padding, square corners, no border or shadow. Holds a title, the form, and nothing decorative. Links inside are marigold.
- **Station plate:** graphite enamel plate with white sign lettering and its Devanagari beneath; sized to its text (inline-block), never full width.

### Inputs / Fields
- **Style:** white fill, 2px white border, square corners, graphite text at 1.0625rem, 3rem minimum height. Labels above at 600. Checkboxes are 1.5rem with a marigold accent and a 2.75rem-tall label target.
- **Focus:** the shared marigold-in-graphite ring.
- **Error:** the border turns signal coral; the message sits below in signal coral at 600, linked by `aria-describedby`. Success is announced in a polite live region with a marigold ring roundel before it, so shape, not colour alone, carries the confirmation.

### Navigation
- **Sign band:** graphite header with the two-ring mark (a white ring and a marigold ring) and the wordmark with its Devanagari, the status plate pushed to the right; under it the half-teal, half-marigold strip. On the confirm and leave pages the wordmark is the home link. There is no menu.

### Station line (signature)
The ordered list of rules drawn as a metro line: two rails, a roundel per station, a graphite plate for each name and a short paragraph beneath. The first station is the interchange (the two rings; on desktop the map's rings stand in for it), the last is the terminus (a filled roundel) where the line ends at the candlelight loop in a 4:3 square-cornered frame. A legend beside the line explains the key: your line, theirs, interchange, end of the line.

**The One Moving Idea Rule.** The rails draw downward as the visitor scrolls (a `scaleY` 0 to 1 keyframe, linear, on a CSS scroll-driven `view()` timeline, range entry 30% to cover 55%; no script). It runs only under `prefers-reduced-motion: no-preference` and `@supports (animation-timeline: view())`; otherwise the line is fully drawn from the start. Only the rails move; every word is visible from first paint. Apart from the hero's interchange, this is the world's only authored motion. The end-of-line video loops longer than 5 seconds, so it carries a rectangular graphite pause plate in its bottom-right corner (marigold when pressed) to satisfy WCAG 2.2.2, and the plate is hidden when reduced motion is requested.

**The Interchange Rule.** Once the page is idle, the hero map is replaced by the same map in 3D, line for line: it lifts into relief, the marigold ring drops through the teal one, catches like a chain link, swings and comes to rest (physics, about three seconds); then nothing moves except a slight tilt with a mouse. It never plays with reduced motion, the data saver, a slow connection, forced colours, a low-memory device or no WebGL 2. The flat map is the picture until the scene's first frames match it, and again whenever anything fails; the scene is aria-hidden and the SVG keeps the name and the words.

## Do's and Don'ts

### Do:
- **Do** keep teal for your line and marigold for theirs, everywhere, including the two-ring mark.
- **Do** set every sign that names a place or a rule bilingual, Devanagari beneath at 0.875em, and route new Hindi through a native reviewer before it ships.
- **Do** make anything pressable a square-cornered plate at least 3rem tall, with the marigold-in-graphite focus ring.
- **Do** put marigold text only on graphite; on white, marigold is a rail or a fill.
- **Do** keep the map rails and station rails on one geometry (12.5% and 14.75% of the column, 1.6% wide) at desktop widths.
- **Do** draw map symbols as inline SVG with real text labels, never as images of words.
- **Do** give anything that moves for more than 5 seconds a pause plate, and draw the finished state when motion is reduced or unsupported.

### Don't:
- **Don't** use pills, rounded cards, gradients, glow or drop shadows.
- **Don't** copy DMRC's logo, line colours or signage artwork; the grammar is borrowed, the marks are our own.
- **Don't** add motion beyond the hero's interchange, the drawing rails and the pausable end-of-line loop.
- **Don't** condense paragraphs; semi-condensed bold is for signs.
- **Don't** use the shared blue focus colour, the shared radius scale or the staff console's coloured left-border notice inside this world.
- **Don't** show people in imagery; the end-of-line loop is people-free footage.
