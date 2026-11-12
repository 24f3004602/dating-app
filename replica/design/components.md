# Components

Date: 2026-11-05 (stage 13, D088-D089). Code: `apps/mobile/src/ui/primitives.tsx`.
Tokens: `tokens.json` (checked by `contrast.py`; `tokens.test.ts` keeps the
code equal to it). Every component and state is on the gallery page `/design`
(development and the e2e build only), scanned by axe in `e2e/tests/design.spec.ts`;
`gallery-web.png` is its screenshot.

Rules for all components:
- **Tokens only:** no raw colours, sizes or fonts in components or screens.
- **Fonts and text size:** system fonts; text scales with the platform's text size, and line heights scale with it.
- **Touch targets:** 48 points for buttons and fields, at least 44 for chips and links.
- **Keyboard focus (web):** a 2-point `focus` ring, 2 points outside the control, so it sits on `bg` or `surface`. Fields show focus with a 2-point accent border instead, and the browser's own ring is turned off.
- **States:** pressed and disabled differ by colour, never by opacity alone. Selection is never shown by colour alone.
- **Errors** are announced: `role="alert"` and `aria-live` on the web and Android, plus `AccessibilityInfo.announceForAccessibility` on iOS, which ignores live regions.
- **No shadows.**
- **Motion (stage 19, D098)**, from the motion tokens (`fast` 150, `base` 240, `hero` 700, `loop` 2400 ms; easing `standard`, `decelerate`, `sway`, never linear):
  - **It follows reduce motion** (the phone's setting, or `prefers-reduced-motion`): with it on, everything appears at rest. Until the setting is known, nothing moves.
  - **Only opacity and transforms move** (native driver on phones).
  - **One focal animation per view.** Functional screens (forms, chat, safety, the staff console) get feedback only.
  - **Nothing pulses or nags.** Badges fade in when they change, never loop.
  - **Nothing moves for more than 5 seconds without a pause control** (WCAG 2.2.2): the rings breathe twice and rest; the landing shoreline has a Pause button.
  - **Decoration is hidden from screen readers**, and whatever it marks is said in text ("It's a match!" is a notice; the rings only decorate it).
  - **No people and no pretend app activity** in any visual (CLAUDE.md: never manufacture users or activity).
- **Light theme only** (dark mode deferred, D088).

```
Screen
  layout     safe area; scroll view focusable on web (keyboard scrolling, WCAG 2.1.1);
             padding xl, gap lg, max width 560, centred
  tokens     bg
  a11y       reflows at 320 CSS px with nothing sticking out (e2e)

Motion (apps/mobile/src/ui/motion.tsx, Rings.tsx)
  Reveal      fades and rises (8 points) into place once, on mount; base duration,
              decelerate; lists stagger 50 ms per item, at most 6 steps; `appear={false}`
              for things already on screen (chat history)
  press       buttons scale to 0.98, cards to 0.99, fast; colours change as before
  FadeImage   photos (Thumb, Photo) fade in when loaded, over the surface placeholder
  Screen      fades in (fast) on the web, where screens have no native transition;
              phones use the platform's transition, none with reduce motion
  Notice, Badge  fade in (fast); a badge fades again when its text changes
  Rings       the mark: meet (welcome, once), breathe (an empty introductions day,
              twice, then rest), join (a match, once, with a marigold glow); aria-hidden;
              on the overlay the teal ring turns white
  Welcome     full screen over the candlelight loop (web) or its still (phones), under
              the overlay (overlay colour at 0.7); text turns on-accent and the focus
              ring highlight inside `<Screen overlay>`; a Pause video button (web);
              no header bar; light status bar
  web         each animated element says `data-motion="animated" | "still"` (e2e)

Website motion (apps/web/app/globals.css, HeroBackdrop.tsx)
  landing     a shoreline at dusk behind the hero: three waves sway (sway easing,
              7-12 s, alternating) and a marigold glow warms and cools; Pause button
              (aria-pressed); the words rise in once; feature cards rise in as they
              scroll into view (CSS scroll-driven animations; static elsewhere)
  story card  a portrait frame beside the headline (below it on phones) with the
              candlelight loop (D099): the WebP still from the first paint (box reserved,
              no layout shift), the video after the browser is idle; WebM then MP4;
              light files on small screens; none for reduced motion, data saver, slow
              connections or HERO_VIDEO=off; the Pause button stops it too
  feedback    links, buttons and fields change colour over 150 ms; buttons press to
              0.98; notices and the 404 page rise in
  reduced     all of it sits in `prefers-reduced-motion: no-preference`; with reduce,
              the page is identical and still, and the Pause button is hidden

Title / Heading / Body / Caption
  type       title 28/34 700 (h1, aria-level 1); heading 20/28 600 (aria-level 2);
             body 16/24; caption 14/20 muted
  tokens     text, text-muted
  a11y       headings carry role and level; Body wraps (flexShrink), never truncates

Button
  variants   primary (accent fill), secondary (accent outline), danger (danger outline)
  size       min height 48, radius md, label type
  states     default; pressed (accent-pressed fill / accent-soft / danger-soft);
             focus (ring); disabled (surface fill, border, text-muted);
             busy (spinner, aria-busy, disabled)
  a11y       role button, name = label (kept while busy); aria-disabled; the spinner
             is aria-hidden (on the web it is an unnamed progressbar: found by axe)
  used on    every screen

TextLink
  look       accent, underlined; pressed accent-pressed; min height 44
  a11y       role link; a real anchor on the web (expo-router Link)
  used on    sign-in ("Forgot your password?")

TextField
  parts      label (label type), optional hint (caption), input, error
  size       min height 48; multiline min height 96, text from the top
  states     default (border-input 1); focus (accent 2); error (danger 2);
             disabled (surface fill, text-muted)
  a11y       aria-label = label, hint as accessibility hint, aria-invalid on error,
             error text role alert (announced)

Checkbox
  parts      24-point box (border-input 2), tick on accent when checked, label
  states     unchecked, checked, pressed (accent-pressed edge), focus (ring)
  a11y       role checkbox, aria-checked, name = label; the row is the target (48)

ChoiceGroup (chips)
  modes      single (radiogroup of radios) or multiple (group of checkboxes)
  look       pill, border-input; selected: accent fill, on-accent text and a tick
  states     default, selected, pressed (accent-soft), focus (ring), error
  a11y       group named by its label; each chip's name is its label; the tick is
             aria-hidden (the checked state says it)

Notice
  kinds      info (accent-soft, accent edge), success (success-soft, success edge),
             error (danger-soft, danger edge)
  a11y       text always `text` colour (15:1); error is an alert and announced on iOS;
             the others are polite live regions

Badge
  tones      neutral (surface), highlight (marigold), success, danger: text colour on each
  use        short statuses: "2 new", "Your turn", photo review state
  a11y       plain text; inside a Card the card's label already says it

Card
  look       row, padding md, border-input edge, radius md; pressed: surface
  parts      Thumb (decorative), CardTitle (heading type, no heading role), Stack of text
  a11y       one button; its label is the whole summary (name, age, statuses); no
             headings inside (a button's content is presentational)
  used on    introductions, likes, matches

Thumb
  size       96 square, radius md, surface placeholder
  a11y       decorative (aria-hidden) unless labelled ("Your photo 1 of 2")

Loading
  a11y       one named progressbar ("Loading"); the spinner inside is hidden

Chat bubble (chat screen; the Interchange, stage 20e)
  look       square plates in each line's colour: mine accent fill, on-accent text;
             theirs highlight (marigold), text; removed: bg with a border line,
             text-muted, no italic (Anek has none; Android would fake one)
  a11y       list of list items; each shows who and when (India time)

More options (top bar; stage 20e, D107)
  look       three drawn dots (space.xs) in on-sign on a 48 target; pressed: the dots
             go on-sign-muted, with Android's ripple
  a11y       one button named "More options"; the dots are hidden; web focus: a
             marigold ring inside the target (highlight on sign, checked)

Sheet (modal bottom sheet; stage 20e, D107)
  look       bg, square, a 2-point sign rule on top, padding xl, content max width;
             over the sign at scrim.opacity (0.4); slides up from the bottom edge
             (base, decelerate) as the scrim fades in; with reduce motion it's just there
  parts      what it's about on a plate; list rows (below; Report carries the arrow); Close
  a11y       a modal dialog named for its content ("Options for Kabir"); Back,
             Escape (web), a tap on the scrim and Close dismiss it; the scrim is hidden
             from screen readers; padded above the navigation bar

Plate (a name on a sign plate; stage 20e, D105)
  look       sign fill, on-sign lettering in the sign face, square (radius plate), sized
             to its text; `heading`: title size and the page's level-1 heading;
             `heading level={2}`: a section heading in the plate's own size (You)
  used on    Today, Likes, Matches, a person, chat, the sheet, You

List row (stage 20e, D108)
  look       full width, 56 high, the label in heading type with a caption hint under it,
             a line under each row (after text a list closes its top with one; after
             another list it starts after a gap, never a second line); pressed: surface;
             `opens`: a drawn arrow (two sides of a small square, turned) at the end
  a11y       one button named by its label; the hint is its accessibility hint (read
             after the name on Android) and visible text; the arrow is hidden
  used on    You (the places under it, then the account), the chat's sheet
```

## Checked on

- **Web (Chrome):**
  - axe on every screen of the four e2e specs, plus the gallery;
  - keyboard Tab focus ring, focused-field border, reflow at 320 px;
  - a visual review of the gallery screenshot, which found the browser ring on fields and the accent and danger clash (D089).
- **Not yet on devices** (NAT-1): VoiceOver and TalkBack reading order, the iOS announcements, and 200% system text size on iOS and Android.
