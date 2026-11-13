---
name: Kinaara (member app)
description: The Interchange on Android, metro wayfinding for fewer, better introductions
colors:
  bg: "#ffffff"
  surface: "#f5f3f0"
  border: "#e4e0da"
  border-input: "#78736b"
  text: "#1c1b19"
  text-muted: "#5c5852"
  accent: "#0e6670"
  accent-pressed: "#08535a"
  accent-soft: "#e6f3f3"
  on-accent: "#ffffff"
  highlight: "#f5b544"
  highlight-pressed: "#e9a632"
  danger: "#a3123a"
  danger-soft: "#fdecf0"
  success: "#1f6b45"
  success-soft: "#e7f3ec"
  focus: "#2453c4"
  overlay: "#1c1b19"
  sign: "#1c1b19"
  on-sign: "#ffffff"
  on-sign-muted: "#d6d2cb"
typography:
  display:
    fontFamily: "Anek-Display"
    fontSize: "40px"
    lineHeight: "42px"
  title:
    fontFamily: "Anek-Sign"
    fontSize: "28px"
    lineHeight: "34px"
  sign:
    fontFamily: "Anek-Sign"
    fontSize: "22px"
    lineHeight: "26px"
  heading:
    fontFamily: "Anek-Sign"
    fontSize: "20px"
    lineHeight: "28px"
  body:
    fontFamily: "Anek-Text"
    fontSize: "16px"
    lineHeight: "24px"
  label:
    fontFamily: "Anek-TextSemibold"
    fontSize: "16px"
    lineHeight: "22px"
  caption:
    fontFamily: "Anek-Text"
    fontSize: "14px"
    lineHeight: "20px"
rounded:
  plate: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.sign}"
    rounded: "{rounded.plate}"
    padding: "0 16px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.highlight-pressed}"
  button-secondary:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.sign}"
    rounded: "{rounded.plate}"
    padding: "0 16px"
    height: "48px"
  button-secondary-pressed:
    backgroundColor: "{colors.surface}"
  button-danger:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.plate}"
    padding: "0 16px"
    height: "48px"
  button-danger-pressed:
    backgroundColor: "{colors.danger-soft}"
  button-disabled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
  plate:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.on-sign}"
    typography: "{typography.sign}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  plate-title:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.on-sign}"
    typography: "{typography.title}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  text-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "48px"
  text-field-disabled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
  chip:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.on-sign}"
    typography: "{typography.label}"
  chip-pressed:
    backgroundColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "12px"
  card-pressed:
    backgroundColor: "{colors.surface}"
  list-row:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.heading}"
    padding: "8px"
    height: "56px"
  list-row-pressed:
    backgroundColor: "{colors.surface}"
  list-row-danger:
    textColor: "{colors.danger}"
  notice-info:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "12px"
  notice-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "12px"
  notice-error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "12px"
  badge-highlight:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.text}"
    typography: "{typography.caption}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  chat-mine:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  chat-theirs:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  top-app-bar:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.on-sign}"
    typography: "{typography.sign}"
  sign-band:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.on-sign}"
    padding: "8px 24px"
  sheet:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.plate}"
    padding: "24px"
    width: "560px"
---

# Design System: Kinaara (member app)

Scope: the member app in `apps/mobile` (React Native and Expo, Android first, the same screens on the web build), light theme only; dark mode is a later stage with its own contrast checks. The world is the website's (`apps/web/DESIGN.md`); this file records how the app carries it. Tokens live in `src/theme/tokens.ts`, kept equal to `replica/design/tokens.json` by a test, with 36 contrast pairs checked to WCAG AA. Decisions D105 to D116 in `replica/decision-log.md` are the app's. Local builds show the working name HAANJI; the brand name is configuration (Kinaara is provisional) and is never drawn into an image.

## Overview

**Creative North Star: "The Interchange"**

The app is the same metro line as the website, ridden every day. Your line is peacock teal, the other person's is marigold; graphite sign plates name people and places; white station roundels outlined in graphite mark where you are. On the website the line is a story told once. In the app it is the furniture: the bottom bar is the line with four stops, the place you're at is the filled stop with its name on a graphite plate, a conversation is two lines of square plates in each person's colour, and the end of the day's introductions is a filled terminus roundel. DMRC's marks are never copied; the grammar of wayfinding is borrowed.

The app works in Operate mode. Android supplies the structure (navigation bar, top app bar with its back arrow, system Back, edge-to-edge insets, 48 dp targets, type in sp that follows the system text size, the platform's own switch and ripple); the Interchange supplies the theme (colour roles, Anek, square plates). Screens are one calm column of white enamel with readable text, lists drawn as station lists, and one marigold plate forward. Functional screens get feedback motion only; the two-ring mark is the only focal movement, at the welcome, an empty day and a match.

Rejected, by the world's contract and the build: the category's swipe-card stack, gradients, pills, rounded cards, drop shadows. Photos in the build are labelled placeholders; no visual shows people or pretend activity.

**Key Characteristics:**
- Two line colours with fixed meanings: teal is yours, marigold is theirs.
- Graphite bars and sign plates on a white enamel ground.
- Anek in five static files: semi-condensed bold for signs, normal width for text.
- Square corners everywhere a member presses or reads; circles only for roundels and the rings.
- Android structure, Interchange theme.
- Drawn marks (tick, arrow, roundel, dots): no icon font, and no glyph stands in for a mark.
- Motion small, from tokens, and still whenever reduce motion is on or not yet known.

## Colors

Two saturated line colours carried by graphite and white, with quiet washes for status.

### Primary
- **Peacock Teal** (accent): your line. The bottom bar's upper rail, your chat plates (lettered in on-accent white), the welcome map's left line, the first of the two rings, text links (underlined), field focus borders, the switch's track when on, the spinner. **Deep Teal** (accent-pressed) is a pressed link. **Teal Wash** (accent-soft) is the info notice's fill.

### Secondary
- **Marigold** (highlight): their line. The bottom bar's lower rail, the other person's chat plates (ink text), the welcome map's right line, the second ring, the primary button plate, the "Your turn"-style badge, and the web focus ring's outline (inside a graphite halo). **Burnt Marigold** (highlight-pressed) is the primary plate while pressed.

### Tertiary
- **Alarm Crimson** (danger): actions that end something. Danger buttons are crimson-outlined with crimson lettering; list rows that end something (Unmatch, Block, Delete photo) carry their label in crimson; field errors and the field's error border. **Crimson Wash** (danger-soft) fills the error notice and the pressed danger button.
- **Signal Green** (success) edges the success notice over **Green Wash** (success-soft), which also fills the success badge.

### Neutral
- **Sign Graphite** (sign): the sign band, the top app bar, plates, selected chips, checked boxes, filled roundels, roundel strokes, the secondary button's outline, the 2-point rules over the bottom bar, the sheet and a profile's decision, and the sheet's scrim (at 0.4). It shares its value with **Ink** (text), the body text colour, and with **Night** (overlay), the welcome's dark layer (at 0.7; its brightest point is checked as overlay-floor).
- **Enamel White** (bg): the page, sheets, the fill of buttons and fields, roundel fill. **On-Sign White** (on-sign) letters graphite; **On-Accent White** (on-accent) letters teal and everything on the welcome overlay.
- **Concourse Stone** (surface): tinted panels (prompts, photo placeholders) and the pressed state of rows, cards, chips and secondary buttons; disabled fills.
- **Station Grey** (text-muted): captions, hints, placeholders, the bottom bar's unselected stop names.
- **Control Edge** (border-input): the edge of a control (fields, chips, cards) and the off switch's track, at least 3:1 on bg and surface.
- **Platform Line** (border): dividers only, such as the line under each list row; never a control's edge.
- **Sign Grey** (on-sign-muted): the pressed dots of More options on the top bar.
- **Keyboard Blue** (focus): the staff console's keyboard focus ring on the website; the member app doesn't use it since D117.

### Named Rules
**The Two Lines Rule.** As lines (rails, chat plates, the map, the rings), teal is always you and marigold always the other person. Never swap them, never add a third line colour.

**The Rails Are Not Text Rule.** Marigold is a rail, a fill or a ring, never text on white; on marigold, the lettering is graphite.

**The Red Ends Things Rule.** Crimson marks what ends a match, a block or data, and each of those asks first. What ends only a session (Sign out everywhere) is not red.

## Typography

**Display Font:** Anek Display (the display file, 760 at 87.5% width)
**Body Font:** Anek Text (400; Anek Text Semibold at 600 for labels)
**Label/Mono Font:** Anek Sign (700 at 87.5% width) for every sign; Anek Devanagari for the name in Hindi

**Character:** One family (Ek Type, OFL-1.1) in five static files, loaded under the token names in `font`. The weight and width are in the file: styles never set `fontWeight`, because on Android a weight on a custom family makes React Native fake a bold. Sizes are sp and follow the member's text size; the phone captures at 1.0 and 1.3 are the evidence.

### Hierarchy
- **Display** (Anek Display, 40/42): the welcome headline only.
- **Title** (Anek Sign, 28/34): a screen's level-1 heading; a person's name plate at the top of their profile.
- **Sign** (Anek Sign, 22/26): names on plates (cards, the sheet's head, You), and the screen's name in the top bar once scrolled.
- **Heading** (Anek Sign, 20/28): level-2 headings, card titles, list-row labels.
- **Body** (Anek Text, 16/24): running text, chat messages, choice labels, field text; wraps, never truncates.
- **Label** (Anek Text Semibold, 16/22): field and group labels, the selected chip's text; button text uses the label's size in the sign face.
- **Caption** (Anek Text, 14/20): hints, times, counts, field errors; badges set it in the semibold file.

### Named Rules
**The Condensed Means Sign Rule.** The sign face is for things that work as signs: titles, headings, plates, buttons, list-row labels, bar titles. Paragraphs and labels stay at normal width.

**The Weight Is In The File Rule.** Pick a voice by its family token; never add `fontWeight` to an Anek family.

**The Marks Don't Scale Rule.** Text grows with the system text size; drawn marks (the tick, the roundel, the arrow, the dots) keep their point size, so a 1.3 text size never cuts a mark off.

## Layout

One column. A screen is a scroll view padded 24 (xl) with 16 (lg) between blocks, at most 560 wide and centred, on bg. The four places (Today, Likes, Matches, You) sit between the graphite sign band at the top and the line bar at the bottom; every other screen sits under the graphite top app bar with Android's back arrow. A bar that draws over an edge takes that edge's inset, so insets are never added twice. Spacing uses the 4-based scale (xs 4 to xxxl 48): 4 inside a field's stack, 8 between chips, 12 inside cards and notices, 16 between blocks, 24 for page and sheet padding. Groups are tight and separations generous (D110).

Targets: 48 for buttons, fields, rows and switches; at least 44 for chips and links; list rows 56. A list closes its top with a line when it follows text. A profile reads person first, then the decision after a 2-point graphite rule, then Block and Report after a hairline (D106).

## Elevation & Depth

Flat. No shadows anywhere: the shadow token group is empty and the top bar's shadow is switched off. Depth is the ground changing: graphite bars against white, plates on cards, the sheet's 2-point graphite rule over a graphite scrim at 0.4 opacity. The welcome screen lays its text over the bundled candlelight still under the night overlay at 0.7, with a white enamel panel for the route map. The one exception is that map's relief in 3D (the Relief Rule): flat tones, no shadow.

**The Enamel Rule.** Surfaces are flat painted planes; separation is by colour block or a line, never by shadow or blur.

## Shapes

Every member-facing rectangle is square-cornered (the plate radius, 0): buttons, fields, chips, cards, notices, badges, photos and thumbs, chat plates, the sheet, prompt panels. The shared radius steps (sm, md, lg, pill) remain in the tokens for the staff console; member screens don't use them. Circles are map symbols only: station roundels (18 with a 3-point graphite stroke, white or filled), the two rings of the mark, the three dots of More options, and Android's own switch thumb. Marks are drawn from views: the tick is two sides of a small box turned 45 degrees in the roundel's 3-point stroke; the arrow is two sides of an 8-point square turned 45 degrees in a 2-point graphite stroke. Photos are kept 4:5.

**The Sign Plate Rule.** If it is pressed or read as a sign, it is a rectangle. No pills, no rounded cards.

## Components

### Buttons
Sign plates, not pills.
- **Shape:** square (0), at least 48 tall, 16 side padding, a 2-point border on every variant.
- **Primary:** a marigold plate with graphite lettering in the sign face at the label size; pressed, burnt marigold.
- **Secondary:** white with a graphite outline and graphite lettering; pressed, concourse stone.
- **Danger:** white with a crimson outline and crimson lettering; pressed, crimson wash.
- **Disabled / Busy:** stone fill, platform-line border, muted text; busy shows a hidden spinner and keeps the label as the name.
- **Press:** scales to 0.98 (fast) when motion is allowed. **Focus (web):** the world's ring: a 3-point marigold outline 2 points outside the plate, inside a 6-point graphite halo (`signRing`), the same on white and over the welcome's video (D117).

### Chips (ChoiceGroup, short options)
- **Style:** white, a 1-point control-edge border, square, 44 tall, body text.
- **State:** selected is a graphite fill with white label-type text and the drawn tick before it; pressed (unselected) is stone. A single choice is a radiogroup, several a group of checkboxes.

### Choice list (ChoiceGroup for sentences; signature)
Full-width rows, 48 or taller, a line on top of the list and under each row, the label in body type wrapping in its row. On the left the line's station roundel, filled graphite when chosen; several choices use the checkbox's square with the drawn tick. Pressed: stone. Used where options are sentences (Report, Privacy, intent, prompts).

### Checkbox and Switch row
- **Checkbox:** a 24 square with the roundel's 3-point graphite edge; checked is graphite with the white drawn tick; pressed, its edge turns teal. For choices sent later (consents, Also block).
- **Switch row:** the body-type label, then Android's own switch: teal track and white thumb when on, control-edge track and graphite thumb when off. For settings that take effect at once (Pause, notification kinds). The label is a second place to tap, not a second control.

### Cards / Containers
- **Card:** a row with 12 padding and gap, a 1-point control-edge border, square, white; pressed, stone and a 0.99 press. Holds a 4:5 thumb (96 wide), a name plate and text; one button, labelled with the whole summary.
- **Plate:** a graphite plate sized to its text, white sign-face lettering; at title size it is the page's heading and names the screen in the top bar when scrolled.
- **Notice:** 12 padding, a 2-point edge in its colour over its wash (info teal, success green, error crimson), text always ink; fades in.
- **Badge:** a small square plate (neutral stone, marigold, green wash, crimson wash) with ink caption text in the semibold file; fades in when it changes, never pulses.

### Inputs / Fields
- **Style:** label above (label type), optional hint (caption), a white square field 48 tall with a 1-point control-edge border and 12 side padding; multiline at least 96.
- **Focus:** a 2-point teal border (the browser's own ring is off).
- **Error / Disabled:** a 2-point crimson border and a crimson caption announced as an alert; disabled is stone with muted text.

### Navigation
- **Sign band:** graphite under the status bar on the four places, the working name in the sign face, uppercase, with its Devanagari beside it when configured. It carries the name, not the place.
- **Top app bar:** graphite, white sign-face title, no shadow, Android's back arrow. Once the screen's title or a person's name plate scrolls under it, the bar names the screen, fading in (at once with reduce motion) and hidden from screen readers. More options sits at its right: three drawn white dots on a 48 target with Android's ripple, dimming to sign grey when pressed; a graphite-dot tone serves the page.
- **Line bar (signature):** the bottom navigation bar drawn as the line. A 2-point graphite rule on top, teal and marigold rails running behind four stops, each a quarter of the bar. Each stop is a white roundel with its name in muted text; the place you're at is a filled roundel with its name on a graphite plate in the sign face. Tabs carry a selected state; pressed stops turn stone.

### List row
Material's list item drawn as a station list: full width, 56 tall, the label in heading type with a caption hint under it, a line under each row, a drawn arrow at the end when the row opens a screen; pressed, stone. The danger tone sets the label in crimson for rows that end something; each asks first.

### Sheet
A modal bottom sheet: white, square, under a 2-point graphite rule, 24 padding, at most 560 wide, over the graphite scrim. Headed by a plate naming what it's about, then list rows, then Close. It slides up (base, decelerate) as the scrim fades in; with reduce motion it is simply there. Back, Escape on the web, a tap on the scrim and Close dismiss it.

### Chat
Two lines of square plates: yours teal with white text on the right, theirs marigold with ink text on the left, each with who and when beneath in caption. A removed message is white with a platform-line border and muted text, never italic (Anek has none).

### Rings and the welcome
The two-ring mark, teal and marigold (the teal ring turns white on the overlay), hidden from screen readers and always explained in text beside it. It meets once at the welcome (hero, decelerate), breathes twice on a day with no new introductions (two loop cycles, under 5 seconds), and joins once at a match, without a glow (the world is flat; D117). The welcome draws the route map on a white enamel panel: the two lines run in, turn at 45 degrees (their bars meeting in mitres), meet at the rings and run on together, labelled in text. The candlelight still ships inside the app under the night overlay; the moving loop plays only on the web build.

**The Relief Rule (D122).** Once the rings have met and the screen is idle, the welcome map is laid over by the same map in 3D, line for line, as on the website (D119): it lifts into relief, the marigold ring drops through the teal one, catches like a chain link, swings and comes to rest in about three seconds; then nothing moves. The lines' depth shows as walls in a darker step of their own colour, roundels are shallow studs, the rings carry 1.25-point graphite outlines; three flat tones, no shadow, blur or glow, the edges smoothed by drawing at twice the size. It never plays with reduce motion on or not yet known; the flat map is the picture until the scene's first frames match it, and again whenever anything fails; the scene is hidden from screen readers and the map keeps its description and its words on top.

**The Still Until Known Rule.** Every animation follows reduce motion; with it on, things appear at rest, and until the setting is known nothing moves. Only opacity and transforms animate, with the motion tokens (fast 150, base 240, hero 700, loop 2400 ms; never linear). Reveals rise 8 points and lists stagger 50 ms for at most six items. Nothing loops past 5 seconds.

**The Drawn Mark Rule.** The app has no icon set: ticks, arrows, roundels and dots are drawn from views and hidden from screen readers, and the control says the state.

## Do's and Don'ts

### Do:
- **Do** keep teal for your line and marigold for theirs in rails, chat plates, the map and the rings.
- **Do** make every pressable thing a square plate at least 48 tall (44 for chips and links), using the plate radius.
- **Do** give a screen's main action the marigold plate and the others a graphite or crimson outline.
- **Do** name people and places on graphite plates in the sign face; keep running text at normal width.
- **Do** use list rows for places and actions, the choice list for options that are sentences, chips for short options, switches for settings that take effect at once.
- **Do** set rows and buttons that end a match, a block or data in crimson, and ask first.
- **Do** pick fonts by family token and size from the type tokens, so text follows the system text size.
- **Do** draw marks from views at fixed point sizes and hide them from screen readers.
- **Do** follow reduce motion everywhere, and stay still until it is known.

### Don't:
- **Don't** use pills, rounded cards, gradients, drop shadows or glows.
- **Don't** put marigold text on white.
- **Don't** set `fontWeight` on an Anek family.
- **Don't** use glyphs or a fallback font for ticks, arrows or other marks.
- **Don't** use the platform-line border as a control's edge; controls take control-edge.
- **Don't** copy DMRC's logo, line colours or signage artwork.
- **Don't** show people, members or activity that don't exist in any visual; photos in development are labelled placeholders.
- **Don't** bake the brand name into an image; it is configuration.
