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
- **No shadows, no motion** for now. If motion is added, it must follow the platform's reduce-motion setting.
- **Light theme only** (dark mode deferred, D088).

```
Screen
  layout     safe area; scroll view focusable on web (keyboard scrolling, WCAG 2.1.1);
             padding xl, gap lg, max width 560, centred
  tokens     bg
  a11y       reflows at 320 CSS px with nothing sticking out (e2e)

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

Chat bubble (chat screen)
  look       mine: accent fill, on-accent text, small corner bottom right;
             theirs: surface, text, small corner bottom left;
             removed: bg with a border line, italic text-muted
  a11y       list of list items; each shows who and when (India time)
```

## Checked on

- **Web (Chrome):**
  - axe on every screen of the four e2e specs, plus the gallery;
  - keyboard Tab focus ring, focused-field border, reflow at 320 px;
  - a visual review of the gallery screenshot, which found the browser ring on fields and the accent and danger clash (D089).
- **Not yet on devices** (NAT-1): VoiceOver and TalkBack reading order, the iOS announcements, and 200% system text size on iOS and Android.
