# Progress

Updated: 2026-11-12

## Current phase

**Stage 20 (bold new visual direction, D100) has started.** It covers the landing website and the member app, in stages.
- **20a, tooling and baseline: done (2026-11-10).**
  - impeccable 4.8.2 is installed for this project with its design hook. The engine's checksum was verified; the engine is git-ignored; impeccable's telemetry is off.
  - `PRODUCT.md` (root, web) and `apps/mobile/PRODUCT.md` (android) are written from confirmed facts. Impeccable reads only the child file inside `apps/mobile`, so the two must change together.
  - `.impeccable/config.json` records code-first.
  - Baseline detector: website source 1 warning (a thick left accent border, `globals.css:52`); the live landing page 2 advisories (a lone last word in two lines); the app's source and live welcome screen none.
  - Baseline screenshots in `replica/design/baseline-2026-11-10/`, taken with playwright-cli 0.1.24 and the installed Chrome.
- **20b, the landing page's direction: done (2026-11-10).**
  - **The questions:** the owner chose a waitlist as the page's action, rewritten copy with the same facts, and 'too quiet or plain' as the thing to avoid.
  - **The roll:** it assigned the Ghat Steps, with one competitive challenger (the Segment Count) and five declined. Four first-screen sketches were checked by the hook and in screenshots: 2 contrast failures, a glow, kicker labels, stripes and 3 layout bugs, all fixed.
  - **The choice:** the owner took **The Interchange** (D101) through the question tool, after the decision page closed unanswered.
  - **The contract:** in `apps/web/.impeccable/surfaces/app-page-tsx.md`. Type: Anek, self-hosted.
- **20c, the waitlist API: done and tested locally (2026-11-10; D101, D102).**
  - **Endpoints:** `POST /v1/waitlist`, `/confirm` and `/leave`, plus a confirmation job, migration 0014 (`waitlist_entries`), three retention rules in the sweep, `SITE_URL`, a counts-only CLI, and a waitlist section in the privacy notice.
  - **Tests:** WL-1..14 pass; the full API suite passes (391); 4 mutation checks were caught; ruff and strict mypy are clean; the OpenAPI types were regenerated (additive only).
  - **Not yet:** CI on a push; the website's form and its confirm and leave pages (20d); the opening email (launch).
- **20d, the Interchange landing page: done and tested (2026-11-10; D103, D104).** impeccable's finish review gave ship for its scored fixes; `apps/web/DESIGN.md` and `.impeccable/design.json` record the system; CI is green on `c0fc08c` (e2e 16/16, including the waitlist).
  - **What:**
    - self-hosted Anek (Latin variable 103 KB; Devanagari static 62 KB);
    - a sign band, a tall map on desktop whose line runs unbroken into the stations, and bilingual enamel sign plates;
    - a route key and a direction sign; the candlelight loop in a square frame at the end of the line; a graphite close;
    - the waitlist form twice, and the confirm and leave pages; the notice renamed.
  - **Checks:** web `tsc` and 16 Node tests pass; `detect` finds 0 issues on the rendered pages. CI on the first commit passed api, mobile (web build plus every e2e test, including the waitlist spec) and images. beta-stack failed on the old notice title; fixed in `3efa92c`.
  - **Not yet:**
    - a native Hindi speaker for every string in `apps/web/scripts/devanagari-text.txt`: the review sheet `replica/launch/hindi-review.md` (2026-11-13) lists all 16 with the English beside each and where it shows (checked: the same 16 as the font list, each verbatim in the page code). **Reviewed 2026-11-13 by the owner, a native Hindi speaker: all 16 kept as they are;**
    - the live site (needs a rebuild and the owner's go). **Live since 2026-11-13** (below).
- **20e, the member app in the Interchange world: started (2026-11-10; D105).** The owner's choices: a bottom bar (Today · Likes · Matches · You), checks on the owner's Android phone, light only, welcome and sign-up first.
  - **Done (not on a device yet):**
    - static Anek TTFs for the app (four Latin voices at about 44 KB each; Devanagari 2.7 KB for the name only), built reproducibly (`build_fonts.py`, two builds byte-identical) and loaded with expo-font (declared at the SDK's 58.0.11);
    - shared tokens: graphite sign colours, font families per type role (no weights in styles, so Android never fakes a bold), display and sign roles, a square plate radius, a pressed marigold; 36 contrast pairs, 0 failing;
    - primitives as sign plates (marigold primary, graphite-outlined secondary, square fields, checkboxes, chips and badges; notices without the side stripe); graphite app bars with a light status bar;
    - the welcome screen: a name sign (Latin, and Devanagari when configured), the display headline, and a route map built from Views on a white enamel panel, with the rings as its interchange (one accessible image).
  - **Checks:** app `tsc` clean; Jest 128 passed (2 new: MOB-16, MOB-17); web 16 passed.
  - **Not yet:**
    - the sign-up, verify, sign-in and reset screens' own pass (they have the new primitives already);
    - e2e on the web build (CI, after a commit);
    - impeccable's finish review and the app's DESIGN.md;
    - slice 2 on the phone (below).
  - **Device pass, slice 1 (2026-11-10):** the owner's Pixel 8 Pro (Android 17), over wireless adb, running the app in Expo Go 58.0.5 against the live beta's API (nothing submitted).
    - **Seen:** welcome, sign-up, sign-in, reset and verify, at text size 1.0 and 1.3. Anek renders; the Devanagari name renders; nothing clips; the map fits at 395 dp.
    - **Fixed on the device:** the map's station roundels overlapped at 395 dp; the interchange is now centred.
    - **Measured:** at 1.3, labels and hints grow 27-34% and the 28 sp headings about 3%. That is Android 14+'s nonlinear font scaling, as designed; the app caps nothing.
    - **Privacy:** demo mode was on and the status bar was cropped from every kept capture. One capture that showed another app was deleted unseen; captures since are taken only with the app in front. The phone's settings were restored afterwards (font scale 1.0, demo off, no port forwards).
    - **This starts NAT-1 (partial).** Not yet: TalkBack, the keystore, the photo picker, push (Expo Go has no remote push on Android), realtime on mobile data.
    - **Also:** a dev server started with `CI=1` doesn't watch files, so the first recapture showed stale code; and `expo start` rewrote `tsconfig.json`, which was restored.
  - **Slice 2, the bottom bar and Today (2026-11-10; not on a device yet, not committed):**
    - **Navigation:** the four main places moved into an `(app)/(tabs)` group (URLs unchanged) under expo-router's headless tabs. The bar is drawn as the line: your rail and theirs, a station roundel per place, and the current place filled with its name on a graphite plate. A graphite sign band with the name sits above. Every other screen still opens above the tabs in the stack, so system Back works as before. The You screen lost its Today, Likes and Matches buttons. The e2e specs now go through the tabs.
    - **Today:** a 4:5 photo for each person (the shape photos are kept in) and the name on a graphite plate (a new `Plate` primitive). A finite set now ends with a last stop saying when the next set arrives (a fixed time, not a countdown).
    - **Checks:** app `tsc` clean; Jest 134 passed (MOB-18 the bar; MOB-19 the plate and the end of the set; MOB-20 and MOB-2b the two bugs below). **Not run:** e2e (CI after a commit).
    - **Device pass, slice 2 (2026-11-11), the owner's Pixel 8 Pro:**
      - **Setup:** signed in as a labelled "Device Check" member on a local API with its own `_e2e_test` database and the labelled fixtures; never the live beta or the owner's account. The first attempt (2026-11-10) was stopped for low memory, so this time the stack was started only once the phone was ready, without the worker.
      - **Seen at 1.0 and 1.3:** all four tabs, a person, system Back (from a tab to Today, from a person to Today). Nothing clips at 1.3.
      - **Found and fixed on the device:** BUG-004 (S1, native only): no API call worked on Android, because openapi-fetch rejected our middleware's returned response. BUG-005 (S4): 44 dp of empty space under every bar, because the status bar inset was added twice. Both are in `bugs.md` with tests and were rechecked on the phone.
      - **Privacy:** Android's password manager offered to save the throwaway login, and one capture showed the owner's Google address. It was declined and the capture deleted; the capture guard now also requires the app to have focus. The phone was restored afterwards (text size 1.0, demo mode off, no port forwards).
      - **Noted for the person-screen slice:** the note and Like/Pass sit above the person's name and photos, so you decide before you see them.
  - **Slice 2 committed and pushed as `90e6c4c`; CI passed** (mobile with e2e through the tabs, beta-stack).
  - **Slice 3, a person's profile (2026-11-11; D106; not on a device yet, not committed):** the person first, then the decision. The name is the page heading on a graphite plate, followed by intent, area, the first photo and the bio; then prompts and photos take turns; then a graphite rule, the note, Like and Pass; Block and Report last. Prompts are square. Checks: `tsc` clean; Jest 135 passed (MOB-21, mutation-checked). **Not run:** e2e.
    - **On the phone (2026-11-11):** as designed at 1.0 and 1.3. Block and Report sat right under Like and Pass, like one grid of four, so they moved to their own section under a light rule. Also: the phone kept a bundle from a dev server that had survived cleanup (its command line reads `expo\bin\cli start`); and the adb server reset during the restore, so the phone was reconnected and restored again (checked: text size 1.0, demo mode off, no forwards).
  - **Slice 3 committed and pushed as `c1b64a9`; CI passed.**
  - **Slice 4, Likes, Matches and chat (2026-11-11; not committed):**
    - Likes: the name on a graphite plate and a 4:5 photo, as on Today. Matches: the name on a plate; the photo stays square, keeping the conversation list compact.
    - Chat: your messages on your line's teal and theirs on their marigold (graphite text), both as square plates. The name is the heading on a plate. Removed messages lose the italic Android would fake.
    - Checks: `tsc` clean; Jest 136 passed (MOB-22, MOB-23 mutation-checked). **Not run:** e2e (CI after a commit).
    - **On the phone (2026-11-11):** as designed at 1.0 and 1.3, through a real match between two labelled local members (the second made through the API). Their like and note on Likes; liking back on their profile made the match (the rings join); Matches; a message sent on the phone and their reply through the API, on teal and marigold. Back goes chat, Matches, Today. Nothing clips at 1.3.
    - **Seen, not changed here:** Unmatch, Block and Report are three heavy outlined buttons between the name and the conversation, the loudest thing on the chat screen. "Matched 2026-11-11" reads like a database date. Local runs show the default working name Haanji unless `EXPO_PUBLIC_BRAND_NAME` is set (the beta sets Kinaara).
  - **Slice 4 committed and pushed as `15812cd`; CI passed.**
  - **Slice 5, the chat's More options (2026-11-11; D107; not committed):** Unmatch, Block and Report leave the top of the conversation for a sheet behind a drawn three-dot button in the top bar. The sheet is headed by the name on a plate; Unmatch and Block ask first inside it. The person screen keeps its visible section. New: `ui/Sheet.tsx`, `ui/MoreButton.tsx`, the `scrim` token (0.4); screen tests get the app's safe-area provider and render top-bar actions in place (`test/expoRouter.ts`). E2E-4 opens the menu first, with axe on the sheet.
    - Checks: `tsc` clean; Jest 139 passed (MOB-24, mutation-checked twice). **Not run:** e2e (CI after a commit).
    - **On the phone (2026-11-11):** as designed at 1.0 and 1.3. The conversation now starts at the name; the sheet slides up over the dimmed chat with the name plate, three rows and Close above the navigation bar. Unmatch asks first in the sheet; Cancel, Back and a tap outside each close it, and nothing reached the API. Report opens the form with the sheet closed; Back returns to the chat. More options is a 48 dp button announced as "More options". Expo Go's own Tools bubble covers the top-right corner in development (moved aside for the captures; not in real builds). TalkBack itself wasn't switched on: the reading order was read from the accessibility tree (the sheet is its own window: name, Unmatch, Block, Report, Close).
  - **Found and fixed:** Prettier, run without a project config, rewrapped six files (about 800 lines). Restored from the commit, with only the real edits re-applied (104/44 lines). The map wasn't one accessible element until `accessible` was set; the welcome test caught it.
  - **Slice 5 committed and pushed as `5f5bbab`; CI passed** (mobile 43122132817 with e2e through the sheet, beta-stack 43122132760, images 43122132722).
  - **Slice 6, You as your own card (2026-11-12; D108; not on a device yet):** under "Your profile", how you appear on Today (the 4:5 cover and your name on a plate, intent, area), the readiness notice and the honest labels; then the places under You as list rows that say what they hold (Photos "1 of 6 photos"; Privacy the chosen visibility, or "Paused"), each with a drawn arrow; the account rows last, with Sign out everywhere explained and no longer red. New: the `ListRow` primitive, which the chat's sheet uses too (its own row component is gone). Also: the matches list says "Matched today", "yesterday" or "4 Nov" instead of a database date (`dayInIndia`).
    - Checks: `tsc` clean; Jest 144 passed (MOB-25 mutation-checked, MOB-26, a list-row primitive test); impeccable `detect` on the five files: 0 findings (regex rules only). **Not run:** e2e (CI after the commit); the phone (needs the owner).
    - **Slice 6 committed and pushed as `107c2f8`. CI found one thing:** the e2e (E2E-3 and E2E-4) reads your name on You as a heading, and the plate had none (it had been a level-2 heading). Fixed: a plate can carry a heading level, so the name is an H2 under "Your profile" again, as MOB-25 now checks. beta-stack passed (43124014623); mobile failed only on those two (43124014736).
    - **CI passed on `11316ce`** (mobile 43125130503 with e2e 16/16, beta-stack 43125130468).
    - **On the phone (2026-11-12), the owner's Pixel 8 Pro:** as designed at 1.0 and 1.3, signed in as the labelled member from a kept session: the card with the cover, the name plate, intent and area; every row with its hint and arrow; Photos opens from its row and Back returns to the place; the chat's sheet with the same rows (Report with the arrow) and Close above the navigation bar; Matches. Nothing clips at 1.3. The tree reads each row as a button named by its label with the hint as text; React Native hands the hint to Android as the node's tooltip text (TalkBack not switched on). The API saw nothing but the chat's realtime tickets. **Fixed on the device:** a second line above the account rows made the gap read as an empty row; the account list now starts after a gap only. **Seen, not changed:** the Photos screen keeps its square thumbs and three outlined buttons per photo (its own pass later). **Also:** the phone had lost its pairing (paired again with the owner's code); Expo Go's Tools bubble sits exactly over the chat's More options button, and one tap there opened Expo's own menu (captures discarded); the dev Redis ran as a throwaway container.
    - **CI passed on `295360b`** (mobile 43126991116, beta-stack 43126991222).
  - **Slice 7, Your photos (2026-11-12; D109; not on a device yet):** each photo as a row as it's kept (the 4:5 thumb, its review state, "Shown first" under the cover) with a graphite More options button; Move earlier, Move later and Delete wait in a sheet named for the photo, and Delete asks first. The eighteen outlined buttons of a full set are gone. `MoreButton` takes a page tone.
    - Checks: `tsc` clean; Jest 144 passed (MOB-27 mutation-checked); impeccable `detect` 0 findings (regex rules only). **Not run:** e2e (CI after the commit); the phone (wireless debugging is off again).
    - **Slice 7 committed and pushed as `c81a693`; CI passed** (mobile 43155878159 with e2e 16/16, beta-stack 43155878176).
    - **On the phone (2026-11-12), the owner's Pixel 8 Pro:** as designed at 1.0 and 1.3: each photo as a 4:5 row with its state and "Shown first" under the cover, a graphite More button; the sheet for the last photo offers Move earlier and Delete, for the first Move later and Delete; Delete asks and Cancel sends nothing; Move later then Move earlier reordered for real (two order calls in the API log, no delete). The tree reads labelled images, the state text and "Options for photo n of 2" buttons. Nothing clips at 1.3.
  - **Slice 8, the auth forms (2026-11-12; D110; not on a device yet):** sign-up's date of birth as one labelled group with its hint; each consent with its link as one group; the verify screen's lost-sign-up state in honest words; autofill on the reset form's email. The four screens were otherwise already right (primitives, keyboards, autofill), so nothing else moved.
    - Checks: `tsc` clean; Jest 144 passed (MOB-28 folded into the auth suite, mutation-checked); impeccable `detect` 0 findings (regex rules only). **Not run:** e2e (CI after the commit); the phone.
    - **Slice 8 committed and pushed as `2636838`; CI passed** (mobile 43156528743 with e2e 16/16, beta-stack 43156528751).
    - **On the phone (2026-11-12):** a real sign-out, then the welcome screen, sign-up (top and end at 1.0 and 1.3: the date's group and each consent pair read as groups, nothing clips), sign-in, reset and the verify screen's lost-sign-up words, all as designed; then a real sign-in. The tree lists the date's label, hint and three fields in order; Android shows no group node for them (the group's semantics are for the web). **Also:** a phone call arrived mid-pass and its heads-up card passed the capture guard (it takes no focus): that capture was deleted and the guard now refuses to capture during any call; the password manager's save sheet appeared after the sign-in and was declined (not captured); the welcome screen's sign-in button reads "I already have an account".
  - **Slice 9, Edit profile (2026-11-12; D111):** a Find your area field narrows the chips as you type (area or city), with a line when nothing matches; the prompt boxes are square. Checks: `tsc` clean; Jest 145 passed (MOB-29 mutation-checked); impeccable `detect` 0 findings (regex rules only). **Not run:** e2e (CI after the commit); the phone.
    - **Committed as `40d3075`; CI passed** (mobile 43161917861 with e2e 16/16, beta-stack 43161917681).
    - **On the phone (2026-11-12), the owner's Pixel 8 Pro:** as designed at 1.0 and 1.3. "noi" left the three Noida areas, "gur" the four Gurugram ones, "zzz" the no-match line; clearing it brought every area back with Saket still chosen. A prompt chosen (not saved) opens a square box with its answer field and Remove. **Seen, not changed:** while the filter hides the chosen area, the choice isn't visible (it is kept, and shows again when the filter is cleared).
  - **Slice 10, choice lists and Unblock (2026-11-12; D112, D113):** choices that are sentences (the report's two questions, Privacy's visibility, Edit profile's intent and prompts) are a list of rows marked with the bar's station roundel, filled when chosen; the roundel is a token now. On Safety each blocked person is a row with the day, and Unblock asks first, in the row.
    - Checks: `tsc` clean; Jest 147 passed (MOB-30, MOB-31, mutation-checked four ways); impeccable `detect` 0 findings (regex rules only). **Not run:** e2e (CI after the commit); the phone (then locked; seen later the same day, below).
    - **Committed as `8daa231`; CI passed** (mobile 43193834599 with e2e 16/16, beta-stack 43193834525).
    - **On the phone (2026-11-12):** as designed at 1.0 and 1.3. The intent, prompt, visibility and report lists draw the roundel, filled for the choice, and long options wrap inside their rows (the report's first reason; at 1.3 also the message excerpt and "Something serious, still figuring it out"). From a profile the report asks only "What's wrong?"; from the chat also "Which part?", with the message excerpt. A fixture blocked from its profile (Block asks first) appeared on Safety as "Fixture Arjun, Blocked today" with a compact Unblock named "Unblock Fixture Arjun"; Unblock asked in the row, Cancel sent nothing, and confirming sent one `DELETE /v1/blocks/{user_id}` and the row went ("You haven't blocked anyone."). Nothing was reported or saved.
    - **First look at Preferences, Notifications and Delete account (2026-11-12):** as designed at 1.0 and 1.3, nothing clips; nothing to change but the tick below.
    - **Found and fixed on the device:** at text size 1.3 every checked box's tick (a ✓ glyph from a fallback font, which grows with the text) outgrew its 24-point box and was cut off: Notifications, the report's "Also block", the consents. The tick is now drawn (two sides of a small box, turned, in the roundel's stroke) and sized from the box; rechecked on the phone at 1.3 and 1.0 (D115). Checks: `tsc` clean; Jest 150 passed (MOB-33, mutation-checked twice); impeccable `detect` 0 findings (regex rules only). **Committed as `50f199e`; CI passed** (mobile 43231989084 with e2e 16/16, beta-stack 43231989153).
    - **Seen, not changed:** an unchecked box's grey 2-point edge (as the fields have) reads lighter than the lists' graphite 3-point roundels on the same screen (Privacy), a question for the finish review. Expo Go's Tools bubble sits on the right edge of the captures (development only).
    - **Privacy:** demo mode on, the status bar cropped, every capture with the app in front and no call; only labelled members and fixtures on screen. The phone was restored (text size 1.0, demo mode off, stay-awake off, no forwards) and disconnected; the local stack was stopped. Evidence in `apps/mobile/.impeccable/review/slice9-10/` (git-ignored).
  - **The design gallery (2026-11-12):** `/design` now shows the stage's primitives too: plates (a name, a level-2 heading), list rows (a place, a place with a hint, an action), the choice list (one and several), More options on the page and on the sign, and a sample sheet; its own swatches and card thumb are square. The gallery e2e runs axe, keyboard focus and the 320 px reflow check over all of it. Checks: `tsc` clean; Jest 148 passed (DS-4). **Committed as `53ca3cb`; CI passed** (mobile 43194661120 with the gallery's axe, focus and reflow checks, beta-stack 43194661152).
  - **impeccable's finish review (2026-11-12; D116):** the reviewer (its own agent, started cold, at the owner's explicit choice) read 53 phone captures and the code: evidence valid, verdict **fix**, seven material fixes, all applied in one batch: the welcome still ships in the app; chips draw the same tick as the Checkbox; the top app bar names a stack screen once its title scrolls away; "Your area" stays in view while filtering; the checkbox edge is the roundel's graphite stroke; Pause and the notification kinds are Android switches; Unmatch, Block and Delete photo rows are in the error colour. Every raster the app ships carries its provenance now.
    - Checks: `tsc` clean; Jest 154 passed (MOB-34..37, five mutations each caught); `embed-prompt --scan` 0 missing. **Committed as `00fd1e9`; CI passed** (mobile 43246372924 with e2e 16/16, the switches and the gallery's axe included; beta-stack 43246372384). **Not run:** the phone recapture and the reviewer's verdict pass (the phone's wireless debugging is off); DESIGN.md waits for a ship verdict.
    - **Recaptured on the phone (2026-11-12):** 27 of the packet's files, over the same names, at 1.0 and 1.3 (every screen a fix touched; signed out and back in for welcome and sign-up). As intended: the candlelight still under the welcome overlay; the bar naming Edit profile, Report Device Check Two, Delete your account, Create your account and Fixture Aarav once scrolled; Your area in view while filtering; graphite checkbox edges and drawn ticks; Android switches named by their labels; red Unmatch, Block and Delete rows. **Found and fixed on the phone:** a title function in the bar, even one drawing nothing, took Android's back arrow (the bar now gets a title only while the name is in it; MOB-34 checks); the chips' drawn tick had no room before the label (now its own box; the chip test checks); both mutation-checked. Jest 154 passed. Not recaptured: the match moment (it needs a new match; only the bar title changed there).
    - **The reviewer's verdict pass (2026-11-12):** all seven fixes **resolved** on the recaptures; still **fix** for two regressions the batch brought: R1, an off switch's white thumb vanished on the white page (WCAG 1.4.11), and R2, "Your area" read as the end of About me. The owner chose another round: R1 is a graphite thumb when off; R2 groups the line with the area search (4 points apart, 16 from About me). Jest 154 passed (both mutation-checked). Unverified: fix 3 on the match moment (not recaptured). Recaptured on the phone (9 captures at 1.0 and 1.3; one notification kind switched off for them and back on after).
    - **Verdict: ship (2026-11-12)**, for the scored fixes: all seven and both regressions resolved, nothing new brought. Its scope, as the reviewer states it: the scored fixes only, not a new review of the whole app; the bar's title on the match moment is unseen (that capture needs a real new match).
    - **CI passed** on `cb11884`, `8d05aa5` and `aca273f` (mobile with e2e 16/16 each, beta-stack).
    - **The owner's choices after the review (2026-11-13; D117):** no glow on a match; the website's marigold-in-graphite focus ring in the app's web build (fields keep their teal border); the web welcome's Pause button a square sign plate with that ring; the beta to get the member app only (the `edge` image) once CI passes. Checks: `tsc` clean; Jest 154 passed (no glow, mutation-checked). **Not run:** e2e (CI after the commit).
    - **DESIGN.md (2026-11-12):** impeccable's documenter (its own agent) wrote `apps/mobile/DESIGN.md` (21 colour tokens, all from `tokens.ts`; the type ramp; rules such as Two Lines, Red Ends Things, Marks Don't Scale, Enamel and Sign Plate) and `apps/mobile/.impeccable/design.json` (10 components, motion, open items). One slip in its sidecar fixed by hand: the line bar claimed the list row's key. **Drift it reported, not repaired (owner's calls or follow-ups):** the web welcome's Pause button is a pill (breaks the square plates); the match's rings add a marigold glow while the world's contract says no glow; the app's web focus ring is blue where the website's is marigold; some numbers sit outside the tokens (the line bar's labels and rails, two wordmark sizes, the route map's 16-point stop); `components.md` has stale entries (system fonts, the button, pressed states, the card's radius, two weights) and `tokens.json` lacks the `size` group and still calls the font the system's.
    - **For the owner (the review's ceiling notes, not fixes):** a teal and marigold strip under the sign band, Today drawn as a line of stations, rules as station signs, the rings beyond welcome and the match. **Pre-existing, reported:** the website's two stills carry no provenance.
- **BUG-002 fixed (2026-11-12; D114; live since 2026-11-13):** Zod runs `jitless` from one module that every schema imports, so the app no longer tries `new Function` under its policy; every e2e spec now fails on any policy violation, which Chrome doesn't always log. Checks: `tsc` clean; Jest 149 passed (MOB-32, mutation-checked); a scratch browser check of the helper. **Committed as `b9e7c63`; CI passed** (mobile 43225245517 with e2e 16/16 and no violation, beta-stack 43225245582).
- **The design docs match the code again (2026-11-13):** the documenter's drift list. `tokens.json` gains the `size` group and the app's `sign-ring`, both now checked by `tokens.test.ts` (a drifted roundel or halo fails it); its notes say each type role's `weight` is the website's CSS weight (the app's is in the font file) and that `sans` is the staff console's face. `components.md` now says what the code does: Anek per voice, square buttons, cards, fields and badges, the buttons' real colours and pressed states, the weights in the files. Checks: `tsc` clean; Jest 154 passed; the website's token CSS regenerates byte-for-byte; contrast 36 pairs, 0 failing; web tests 16 passed; **CI passed on `50d9013`** (mobile 43363646290 with e2e 16/16, beta-stack 43363646310, images 43363646337). **Left as known:** a few literal numbers outside the tokens (the bar's 13/18 labels and 4-point rails, two wordmark sizes, the route map's 16-point stop, the plate's 2-point padding, 2-point borders).
- **The website and the waitlist live (2026-11-13, the owner's go):** after the owner, a native Hindi speaker, kept all 16 Hindi lines. The `beta-images` run 43367443763 built the website and API images from `e779214` (the API's newest migration 0014); their SHA-256s checked here; a backup first (`db-20261113T050035Z.dump`, 131 KB, its 34 tables listed by `pg_restore --list`); the running images tagged `rollback-20261106` (API) and `rollback-20261107` (website); `migrate` took the database from 0013 to 0014 (the `waitlist_entries` table); then only the API, worker and website restarted, all healthy. **Not intended:** `docker compose run migrate` also recreated postgres (its settings had changed since it was made): a clean shutdown and restart within a second, the data directory kept ("Skipping initialization"); deploy.md now says `--no-deps`. **Checked live:** the website, the app, the privacy notice (with its waitlist section) and the confirm page answer 200, `/readyz` 200; an empty waitlist request gets 422 (nothing stored); headless Chrome at 390 and 1280 px: the Interchange page with "Join the waitlist" and the Hindi, no console error, no CSP violation, no 5xx. **Still open:** the privacy notice and terms have had no lawyer's review (owner, below), and the waitlist now collects email addresses from the public under them; waitlist emails go from the beta's Gmail.
- **Stage 20e live on the beta (2026-11-13; D117, D118):** the owner chose to update the member app only. Building its image on the laptop ran it to 0.3 GB free and Claude Code stopped the build (nothing changed live; the leftover build processes were stopped by hand). By the owner's choice the image was built in GitHub Actions instead (the new `edge-image` workflow, since renamed `beta-images`, run 43361649805, from `c695e42`, whose app code is `a6588c1`), downloaded with its SHA-256 checked, loaded, and only the app container restarted; the image it replaced is tagged `rollback-20261107`. **Checked live:** the app, the website and the API's `/readyz` answer 200; the other six containers kept running; in headless Chrome the welcome shows the new design (Kinaara, the square Pause button) with no console error and **no CSP violation** (BUG-002's fix is live). The website and the API are unchanged: the landing page, the waitlist and their Hindi copy stay off the live site.

Stage 19 (motion and visual polish, D098) **done: CI passed on `4b68e81`** (mobile 42210375883 with e2e 13/13, beta-stack 42210375876, images 42210375717). **On the live beta since 2026-11-07** (owner's go). The web image was built from `0da7ff1` (replaced by the Interchange website on 2026-11-13); the only later change to the website is a test, which isn't shipped. The edge image was built from `eb80094` (replaced by stage 20e's on 2026-11-13). Checked through Cloudflare: the landing page names the loop files; the media return 200 with their committed sizes; the CSPs allow the media (website `'self'`, app the website's origin); the app bundle names the loop. In headless Chrome (1280 and 390 px), both videos play and loop with no console errors; the app reports one blocked `eval` from Zod's probe (BUG-002, S4, existed before; fixed 2026-11-12, not live yet).
- **App:** a motion module (Reveal, press feedback, photo fade-in, screen fade on the web) on React Native's own Animated; the two-ring mark (meet, breathe, join) on the welcome screen, an empty introductions day and a match; list staggers; new chat messages slide in.
- **Website:** a drawn shoreline at dusk behind the landing hero, with a Pause button; the words rise in; feature cards rise in on scroll; feedback on links, buttons and fields.
- **Rules kept:** everything follows reduce motion; no new libraries; nothing moves more than 5 seconds without a pause; no people or fake activity in visuals.
- **Video (D099, 2026-11-07):**
  - **The owner's Canva couple clip was refused:** Canva's licence bars people in promotional material for dating services.
  - **What's used instead:** a people-free candlelight loop (5.5 s, about 470 KB for every size and format).
  - **Where:** a story card on the landing page, and full-screen under a dark overlay behind the app's welcome screen. The overlay has new checked tokens.
  - **Served through Cloudflare** by the owner's explicit choice, despite the CDN terms; it can be switched off (deploy.md).
- **Sizes:** app web JS +2 KB gzipped; website JS +12 KB, CSS +3 KB; no video.

**The closed beta (D096, D097)** has been running on this laptop since 2026-11-06.
- Gmail sending works (the app password was checked against Gmail).
- The owner has a member account and a separate staff account (`+admin`), made admin through the runbook and audited. The staff authenticator is enrolled and has been used to sign in (checked 2026-11-08).
- **This laptop is the live server.** It has 8 GB, and only 0.1-0.7 GB was free during test runs, so the WSL Redis used by tests stopped. Heavy local builds and test runs compete with the beta; prefer CI for them.
- **Outage, 2026-11-07 19:10-19:15 IST:** after the laptop restarted, the site returned Cloudflare 530 because Docker Desktop didn't start. Its "Start Docker Desktop when you sign in" setting is off (deploy.md asks for it on). Starting Docker brought every container back healthy. The owner has since turned the setting on (checked 2026-11-08).
- **Backups (BETA-5, 2026-11-08):** the first backups exist in `%USERPROFILE%\datingapp-backups`, and a restore into a scratch database matched every table's row count. The home run had never saved photos (BUG-003, fixed in `backup.sh`). Photo restore stays untested until there are photos. The owner registered the daily 03:00 task (`infra/beta/schedule-backup.ps1`); its first run (06:01) returned 0 and logged a good backup.
- **Outage, 2026-11-08 to 2026-11-10 (about 44 hours or more):** the laptop ran on battery with the lid closed. It went into standby at 08:01 on Nov 8 (reason: lid), then hibernated at 14:16 when its 6-hour battery timer ran out, and only woke at 10:04 on Nov 10. The containers were back at 10:28. Both nightly backups were missed.
  - The 10:10 catch-up backup wrote a good dump (292 objects), but its photo step was killed (`0xC000013A`). Docker was still recovering then, and restarted every container at 10:28. Its 0-byte archive was deleted, and a complete backup was taken at 11:42.
  - Settings on mains power are right (never sleep or hibernate). The cause is running unplugged: the beta needs the laptop plugged in with the lid open, or a real server (gate 5).
- **Outage, 2026-11-12 03:52-05:07 IST (about 75 minutes):** Windows Update restarted the laptop for a planned servicing update (three restarts, 03:52-03:55); the containers came back at 05:07, when Docker Desktop started at sign-in. The 03:00 backup task had started at 03:31 and was terminated by the restart (result 0x40010004), writing nothing; a catch-up backup at 05:16 IST is good (`db-20261111T234654Z.dump`, 131 KB; the photo archive is still empty because no tester has photos). Windows's active hours (Settings, Windows Update) keep such restarts outside the hours the owner picks, but not for ever; a real server (gate 5) is the fix.
- **Next (owner):** copy the backups off the laptop weekly; the first testers' invites.

## Done

| stage | result | files |
| --- | --- | --- |
| 1 | Docs skeleton | `README.md`, `.gitignore`, `replica/` docs |
| 2 | Competitor recon of Tinder, Bumble and Hinge; 22 dated public sources | `recon.md`, `feedback.md` |
| 3 | Audience, market, positioning, differentiation, MVP, pricing hypotheses, success criteria, provisional names | `fixes.md`, `brand.md`, `launch/pricing.md`, `features.csv` |
| 4 | Architecture with verified dependency versions; threat model; privacy inventory; planned test cases; staged build plan | `architecture.md`, `security-threat-model.md`, `privacy-data-inventory.md`, `test-plan.md` |
| — | Owner decisions recorded; histories merged (D030); Replica skills vendored (D031); standing rules in `CLAUDE.md` | `decision-log.md`, `.claude/skills/`, `CLAUDE.md` |
| 5 | FastAPI app factory, settings, async SQLAlchemy, RFC 9457 errors, request IDs, privacy-safe logs, body limit, `/healthz`, `/readyz`, OpenAPI at `/v1/openapi.json`; Alembic baseline (4 tables, owner and runtime roles); dev seed; CI workflow; 69 tests. CI run 41823765056 passed | `apps/api/`, `.github/workflows/api.yml` |
| 19 | Motion and visual polish: motion tokens, the app's motion module and ring mark, list staggers, chat arrivals, photo fade-in, the landing shoreline with a pause control, CSS micro-interactions, a dormant video slot with its CSP; everything follows reduce motion; e2e runs still by default plus a motion spec | `apps/mobile/src/ui/motion.tsx`, `apps/mobile/src/ui/Rings.tsx`, `apps/web/app/HeroBackdrop.tsx`, `apps/web/lib/heroVideo.ts`, `replica/design/components.md` |
| 18d | Home mode: `compose.tunnel.yaml` (Cloudflare Tunnel, no open ports, only the tunnel may name the visitor), the notice's hosting wording, the `home-mode` CI job, the home guide in deploy.md | `infra/beta/compose.tunnel.yaml`, `apps/web/lib/documents.ts` |
| 18c | One-server kit for the beta: compose (PostgreSQL, Redis, API, worker, web, Caddy with the app's web build), automatic HTTPS, only 80/443 published, secrets made on the server, backups; the app's CSP shared with e2e; the beta-stack CI workflow | `infra/beta/`, `.github/workflows/beta.yml`, deploy.md |
| 18b | Tester notice (terms and privacy for the beta, website pages, linked at sign-up); Android beta build settings that refuse placeholders; invite-only hint | `apps/web/app/privacy`, `apps/web/app/terms`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json` |
| 18a | Closed beta, server side: SMTP email over TLS (stdlib, fake-server tested), the `beta` environment, invite-only sign-up (HMAC list, `datingapp-api invite`), invites swept at 30 days; migration 0013 | `app/providers/email.py`, `app/config.py`, `migrations/versions/0013_signup_invites.py` |
| 17 | Release readiness: preflight run and recorded; container images for the API, worker and web, built and smoke-tested in CI (never pushed); `TRUSTED_PROXIES`; production guards for test backends and http origins; a complete `.env.example` with a test; original placeholder icons; rebrand sweep; the staging plan and runbooks (planned) | `replica/deploy.md`, `apps/*/Dockerfile`, `.github/workflows/images.yml` |
| 16b | Billing rules evaluated (Apple, Google Play in India, Razorpay); the payment-provider interface, a Razorpay adapter (fake-server tested), signed and deduplicated webhooks, a server-side entitlement, cancel at cycle end, cancellation on deletion, a live-key guard; migration 0012 | `replica/launch/pricing.md`, `app/modules/billing/`, `app/providers/payments.py` |
| 16a | Discreet notifications: push devices tied to sessions, fixed sentences with kind-only data, preferences, throttles, team notices for warnings, an Expo adapter (fake-server tested) with receipts, the app's settings screen and notices; migration 0011 | `app/modules/notifications/`, `apps/mobile/src/notifications/` |
| 15 | Audit: feature matrix checked row by row with evidence under one status rule (D092); architecture checked against the code (endpoints, jobs, tables); every test level run; route inventory test; recovery e2e; BUG-001 (the 404 page's CSP) fixed; stale threat-model and architecture statements corrected; `bugs.md` started | `replica/features.csv`, `replica/bugs.md`, `tests/test_route_inventory.py` |
| 14b | Next.js landing page and staff console (queue, report detail and actions, photo review, audit log, staff authenticator resets) as a backend for the browser: HttpOnly `__Host-` cookies, server-side session checks on every page and action, nonce CSP; web e2e with axe | `apps/web/`, `e2e/tests/admin.spec.ts` |
| 14a | Staff sign-in with a second factor: password, then a TOTP code or recovery code; enrolment only with a one-time token from another admin or the server CLI; secrets encrypted; codes work once; separate `web_admin` sessions (12 h, 30 min idle); migration 0010 | `app/modules/staff/` |
| 13 | Design system: role tokens checked for contrast and kept equal to `replica/design/tokens.json` by a test; type scale, 48-point targets, web focus rings, distinct pressed and disabled states; Caption, TextLink, Badge, Card, Thumb; the peacock and marigold palette; a `/design` gallery with axe, focus, field and reflow checks; applied across the screens | `replica/design/`, `apps/mobile/src/ui/primitives.tsx` |
| 12b | Delete-account screen (from the profile in any state and from Privacy), the welcome-screen date, Keep my account on sign-in, Privacy hints that say what visibility and pause do; e2e of delete, keep and delete again | `apps/mobile/src/screens/account.tsx`, `e2e/tests/privacy.spec.ts` |
| 12a | Account deletion (password, 7-day restore, purge through the database cascade, photo files by a queued job, report hold, banned-email hash), retention sweep (conversations, picks, sessions, codes, unverified sign-ups, reports, records), expired audit records through an owner-rights function, the store review; migration 0009 | `app/modules/privacy/`, `privacy-data-inventory.md` |
| 11b | Unmatch, Block and Report on chats and profiles (with confirmations), the report form, the Safety screen (blocks, report statuses), removed messages, `match.closed` in the app; e2e report flow | `apps/mobile/src/screens/safety.tsx` |
| 11a | Block, unblock and unmatch (closing the match under the send lock), reports with a copy of the reported message and a visible status, the moderation queue, photo review, account actions, message removal, staff roles, audited reads and actions, append-only moderation records; migration 0008 | `app/modules/safety/`, `app/modules/moderation/` |
| 10b | Chat screen (history, send with retry by the same ID, the hurtful-word prompt, the money tip, read pointer, older pages), matches list with last message, unread and your turn, realtime client (tickets, catch-up, backoff, heartbeat watchdog, close codes); two-person e2e on a fresh database per run | `apps/mobile/src/screens/chat.tsx`, `apps/mobile/src/realtime/`, `e2e/tests/chat.spec.ts` |
| 10a | Messages in open matches (idempotent, gap-free numbering under the match row lock), history pages, read pointers and unread counts, the your-turn cap, nudge lists, realtime hints over WebSockets (tickets, one Redis channel, revocation, caps); migration 0007 | `app/modules/messaging/`, `app/modules/realtime/`, `app/realtime.py` |
| 9 | Likes and passes (no undo, idempotent retries), the equal daily like limit, notes on likes, atomic mutual matches, likes received, matches, access through likes and matches; Like and Pass on profiles, likes and matches screens; migration 0006 | `app/modules/matching/`, `apps/mobile/src/screens/matching.tsx` |
| 8b | Screens: today's introductions (empty, not-ready, paused and error states), a person's profile, preferences; e2e extended through discovery with axe | `apps/mobile/src/screens/discover.tsx`, `e2e/` |
| 8a | Discovery API: preferences, eligibility filters before ranking, the deterministic daily set (built once, availability re-checked on read), distance buckets, access to profiles and photos in today's set, rate limits, labelled fixtures; tables for interactions and blocks (D064); migration 0005 | `app/modules/discovery/`, `app/fixtures.py` |
| 7b | Expo SDK 58 app (`apps/mobile`): typed API client from the OpenAPI spec (`packages/api-types`), keystore session, accessible primitives and provisional tokens, 9 screens; web e2e with axe (`e2e/`); CORS allow-list; mobile CI workflow | `apps/mobile/`, `packages/api-types/`, `e2e/`, `.github/workflows/mobile.yml` |
| 7a | Profiles and media API: areas (seeded, no coordinates out), profile create/replace with prompts, privacy (visibility, pause), the one-per-day area limit, the access policy (404 for anything not allowed), safe photo pipeline, private storage with signed URLs, reorder, delete through a queued job; migration 0004 | `app/modules/profiles/`, `app/modules/media/`, `app/policies/`, `app/providers/storage.py` |
| 6 | Auth API: register (age gate, NIST passwords, consents), verify email (code + password, D045), resend, login, logout, logout-all, password reset, `/v1/me` with honest labels; Redis rate limits (fail closed); lockout; procrastinate worker with transactional jobs; email, SMS and identity provider interfaces; migrations 0002-0003 | `apps/api/app/modules/auth/`, `app/providers/`, `app/jobs.py`, `app/ratelimit.py` |

## Stage 19 status

- **Implemented and tested:**
  - MOT-1..8 (app), WEB-6 and VID-1..4 (web), E2E-9..12 (browser).
  - Mutation checks: ignoring reduce motion, and an endless breathing loop, each fail a test.
- **Checked by eye:** the screenshots at 390 and 1280 px (landing) and of the welcome screen. The words never sit on the waves.
- **Found and fixed:**
  - The landing hero's words needed space reserved below them, so the waves never overlap text at any width.
  - The website's CSP needed `media-src` before any video could be allowed.
- **Not done:**
  - Real video: done (D099).
  - Motion on a physical phone (part of NAT-1).
  - Updating the live beta: done 2026-11-07.

## Stage 17 status

- **Implemented and tested:** OPS-1..5 in `test-plan.md`. The images workflow ran every smoke step.
- **Found and fixed:**
  - The app still shipped Expo's template icons, Expo's own logo; they're now an original placeholder.
  - `.env.example` listed 13 of 58 settings, and said rotating `APP_SECRET_KEY` voids "live codes only". It also breaks staff authenticators, banned-email hashes and photo links.
  - Forwarded client IPs were ignored outright (`proxy_headers=False`): safe, but behind a load balancer every member would share one rate-limit bucket. Now there's an explicit trusted list.
  - A worker test's scratch-database teardown could race a closing pool; it now waits.
- **Planned only (deploy.md):**
  - the staging environment;
  - DNS, TLS, monitoring and backups;
  - EAS builds;
  - the incident and data-breach runbooks (DPDP Rule 7, in force from 2027-05-13, followed from day one).

## Stage 16b status

- **Evaluated** (`launch/pricing.md`, D094):
  - In India the iOS app must sell the plan through in-app purchase and can't mention the web price.
  - Android uses Play Billing, with user-choice billing possible.
  - Razorpay serves the website.
  - Recommendation: no paid plan during the beta.
- **Implemented and tested:** BIL-1..8.
- **Mutation checks:** each of these breaks a test: no signature check, no stale-event check.
- **Not built (owner decisions and accounts):**
  - what the plan includes and its price;
  - the website checkout screen (it also needs Razorpay's script allowed in the CSP);
  - in-app purchase and Play Billing;
  - a run in Razorpay's sandbox (needs a public URL for webhooks, stage 17).

## Stage 16a status

- **Implemented and tested:** NTF-1..9 and MOB-12 in `test-plan.md`, plus a Notifications step in the onboarding e2e.
- **Mutation checks:** each of these breaks a test: no live-session check (pushes would reach signed-out phones), no throttle.
- **Blocked (owner):** delivery needs an EAS project ID in the app config, Firebase credentials (Android) and an Apple developer account (iOS). Until then the app says notifications aren't available in this build, and the API sends nothing (`PUSH_BACKEND=none`).
- **Not yet:** a device pass for push (NAT-1).

## Stage 15 audit

| check | result |
| --- | --- |
| feature matrix | every `yes` names its tests (D092). 17 of 20 must-haves; parity 74.1. Partial must-haves: email registration and recovery (no email provider), photos (no bucket) |
| architecture against code | 51 endpoints, 7 jobs and every table accounted for. 4 tables were missing from the data model (added) |
| routes | 14 public by design, 33 member, 11 staff. A test now fails on any route without a session (AUD-1, mutation-checked) |
| API | ruff, format and mypy clean; 320 tests pass; pip-audit clean |
| app | typecheck; 103 tests pass; the web export works |
| web | 2 tests pass; the build and typecheck pass |
| e2e | 8 tests across 6 specs passed in each of 2 runs; axe on every screen |
| supply chain | npm: 0 high or critical; 24 moderate or low, all in development tooling |
| design | contrast 26 pairs, 0 failing AA |
| security read-through | T03, T05, T11, T15, T20 and T21 updated to what's built; test IDs that didn't exist fixed |

- **Found and fixed:**
  - BUG-001 (S4): the built-in 404 page had no CSP nonce, so its scripts and styles were blocked. Our own 404 page now renders per request.
  - Password recovery had no browser test; E2E-7 covers it now.
- **Release gates** (all features at once):
  - the native device pass (NAT-1);
  - deployment with TLS (stage 17);
  - owner setup: email provider and DNS, bucket, legal documents, Dependabot, SMS/DLT, trademark.

## Stage 14b status and build log

| screen | state | notes |
| --- | --- | --- |
| landing | done | built features only, not open yet; CSP; axe and reflow |
| staff sign-in | done | password, enrolment token, key and otpauth link, code, recovery codes; axe on each step |
| reports, report | done | queue by urgency; reported item, message copy, what members saw, history; resolve; reinstate (admin) |
| photos | done | approve or reject; your own photos never shown to you |
| audit log, staff | done | admins only (the API decides); authenticator reset shows the token once |

- **Found and fixed:**
  - React resets a form after an action, so a wrong password also wiped the email; it's now kept.
  - The final sign-in step re-rendered the route without its page title (axe); it's now set explicitly.
  - The seeded fixtures can't sign in (undeliverable domain, by design), so the e2e creates its own labelled admin, in the e2e database only.
  - The format check failed CI for 14a: I'd formatted `app` and `tests` but not `migrations`. I now run CI's exact commands over the whole project.
- **Not yet:**
  - QR codes for enrolment.
  - A static not-found page without the nonce.
  - Deployment and TLS (stage 17).

## Stage 14a status

- **Implemented and tested:** STF-1..7 in `test-plan.md`.
- **Mutation checks:** each of these breaks a test: no replay check, no session separation, no enrolment token, no idle timeout.
- **Found and fixed:**
  - Tests moving the clock forward days at a time now use fresh staff sessions: the 12-hour limit applies to them too.
  - The enrolment step read the email after a rollback, which expired it.
- **Not yet:**
  - The console (14b).
  - WebAuthn passkeys as a stronger second factor (later).
  - A device list.

## Stage 13 status

- **Implemented and tested:** DS-1..3 and E2E-6 in `test-plan.md`; specs in `replica/design/components.md`. Screens behave as before: every earlier test and e2e passes, and only the matches test changed, from one status line to two badges.
- **Found and fixed:**
  - Spinners were unnamed progressbars on the web, in every busy button and loading screen (axe on the gallery).
  - Chrome drew its own dark ring over focused fields; `outline-width: 0` doesn't remove `outline-style: auto` (gallery screenshot).
  - The berry accent and the danger red were 5 degrees of hue apart, so destructive buttons looked ordinary. The accent is now peacock teal (D089).
  - Cards (introductions, likes, matches) had headings inside buttons.
  - iOS doesn't announce live regions, so errors now announce themselves there.
- **Partial, by design:**
  - Dark mode is deferred (D088).
  - No custom font: system fonts cover Devanagari and Gurmukhi.
  - VoiceOver, TalkBack and 200% system text need the native pass (NAT-1).

## Stage 12b build log

| screen | state | notes |
| --- | --- | --- |
| delete account | done | what happens, kept, unreachable; password; errors; e2e and axe |
| welcome | done | after a deletion: the India date and how to keep the account; axe |
| sign in | done | "waiting to be deleted" with the date, Keep my account; e2e and axe |
| privacy | done | hints for visibility and pause; the way to deletion; axe (onboarding spec) |

- **Found and fixed:**
  - The delete link sat only in Privacy, which needs a profile, so a member who never finished sign-up couldn't delete the account from the app. Profile now shows the link in every state (D087).
  - The Privacy hints didn't say that "Only people I have liked" keeps you out of introductions, or that pausing holds back likes you've sent.

## Stage 12a status

- **Implemented and tested:** F09-H1 and PRIV-* in `test-plan.md`. The purge is checked table by table, and photo files are checked in storage. Every retention rule is checked one step either side of its period. The real worker runs all three privacy jobs.
- **Mutation checks:** each of these breaks a test: no report hold, no barred-email check, no session revocation, no re-check under the row lock.
- **Found and fixed:**
  - Unverified sign-ups were kept forever (email, password hash, birthdate); they're now deleted after 7 days.
  - A reinstated account that was waiting for deletion would have become active with its deletion date still set; it now goes back to waiting.
  - procrastinate keeps an external pool after closing, so a second worker test reused a closed pool. Production opens once per process; the tests reset it (D085).
- **Partial, by design:**
  - The app screens are 12b.
  - The data export is planned before launch (D086).
  - Erasure for suspended or banned members goes through the grievance contact until the staff console (stage 14).
- **Residual:**
  - Orphaned files if a deletion job fails 8 times (needs a reconciliation sweep with the bucket adapter).
  - Periods marked (R) need legal review.

## Stage 11b build log

| screen | state | notes |
| --- | --- | --- |
| chat, person | done | Unmatch (chat), Block, Report; the first two ask first; e2e |
| report | done | reasons, their latest messages, details, also block (default on), sent state; e2e and axe |
| safety | done | blocked people with unblock, my reports with status; e2e and axe |

- **Found and fixed:** CI failed on a Jest timeout. With no transform cache, as on CI, the first screen test in a file pays the one-time cost of compiling React Native modules and passed 5 s; warm, the whole file takes 4 s. The test timeout is now 30 s; from a cleared cache all 86 tests pass in 53 s.

## Stage 11a status

- **Implemented and tested:** F06-*, ADM-*, SAF-* and MODR-* in `test-plan.md`.
- **Mutation checks:** without the send lock, a message is stored after a block; without the staff check, a member reads the queue.
- **Partial, by design:**
  - No app screens yet (11b); the staff console is stage 14.
  - Warnings are recorded but not sent (notifications, stage 16).
  - Purging conversations 30 days after they end, and the banned-email hash, come with retention in stage 12.
  - The duplicate photo-hash signal is not used yet.
- **Release blocker:** `/v1/admin` must require separate staff sessions with two-factor authentication (stage 14) before any deployment (D081).

## Stage 10b status and build log

| screen | state | notes |
| --- | --- | --- |
| chat | done | sending, not sent and retry, the hurtful-word prompt, the money tip, the storage note, older pages, gone; live updates; e2e and axe |
| matches | done | last message, unread, "your turn", the waiting notice; updates live; e2e and axe |
| like | done | the your-turn message |

- **Found and fixed:**
  - The e2e used the developer's database, so earlier runs' members could crowd a new member's daily set; each run now gets a fresh database (D078).
  - The matches list showed the UTC date; dates and times are now in India time.
  - Locators found text twice: the matches list stays mounted under the chat and shows the same preview, so the spec reads messages by list item.
- **Not done:** a native device run (NAT-1), now also for the realtime connection and the keyboard behaviour of the composer.

## Stage 10a status

- **Implemented and tested:** F05-*, MSG-* and RT-* in `test-plan.md`.
  - Concurrent sends from both people, with double taps and a reader polling `after=`, give gap-free numbers and one stored row per message (MSG-C1).
  - Real-time tests run a real uvicorn server and WebSocket client, with a second app instance standing in for another API process.
- **Mutation checks:** without the send lock, sends collide; with reusable tickets, the reuse test fails.
- **Found and fixed:**
  - PostgreSQL returned timestamps in the server's zone (Asia/Calcutta here, UTC in CI); sessions are now pinned to UTC (D076).
  - The age-gate test helper used the UTC date and failed every evening (D076).
  - Uvicorn logged WebSocket handshakes with the full IP and the ticket in the query string; filtered (D074).
  - The hub fixed the connection cap at start-up, so changed settings were ignored; the router now passes the current settings.
- **Partial, by design:**
  - No app screens yet (10b).
  - Unmatch, the block API and message removal come in stage 11; the 30-day purge after unmatch in stages 11-12.
  - The nudge lists are a starter list for moderators to tune (D075).

## Stage 9 status

- **Implemented and tested:** cases F04-*, MAT-* and MOB-6.
  - Two simultaneous reciprocal likes create exactly one match, over 50 rounds on real connections.
  - Ineligible people (blocked, suspended, paused, unreachable) cannot be liked or matched.
- **Found and fixed:** the concurrency test found a deadlock. `FOR UPDATE` on a user row blocked other transactions' foreign-key checks; referenced rows are now locked with `FOR NO KEY UPDATE` everywhere (D071).
- **Mutation check:** removing the pair lock makes a match go missing.
- **Partial, by design:**
  - The your-turn cap needs messages (stage 10).
  - Unmatch and the block API come in stage 11; matches already hide on a block.
  - In the app a like can carry a note, but not yet a chosen photo or prompt.

## Stage 8b build log

| screen | state | notes |
| --- | --- | --- |
| today's introductions | done | bucket labels only; empty set shows the next set time in India; e2e and axe |
| person | done | approved photos, prompts, bio; "no longer available" state; e2e and axe |
| preferences | done | age range and distance bucket; "applies from your next set"; e2e and axe |

- **Found and fixed:**
  - Screens without controls could not be scrolled by keyboard on web (axe, WCAG 2.1.1); the scroll container is now focusable on web (D069).
  - An un-awaited RNTL `unmount()` broke the next test.

## Stage 8a status

- **Implemented and tested** (cases F03-*, DSC-* in `test-plan.md`): every filter in the brief is in SQL before ranking, tested one rule at a time:
  - adult, reciprocal gender, age and distance;
  - intent compatibility;
  - visibility and pause;
  - blocks both ways;
  - prior interactions.
- **Also covered:** the set is finite (15), deterministic and stable all day; people who become unavailable leave at once; responses carry only distance buckets.
- **Smoke run:** the real dev server with seeded, labelled fixtures returned 5 ranked cards.
- **Partial, by design:**
  - Likes and passes have no API until stage 9, and the block API waits for stage 11 (both tables exist and are filtered on).
  - `liked_only` members stay out of discovery until likes exist.
  - Own photos stay pending until moderation (stage 11), so a real member can't browse without `PHOTO_REVIEW_REQUIRED=false` in development.
- **Found and fixed:**
  - SQLAlchemy 2.1 deprecates `ARRAY.any()`; warnings-as-errors turned it into a 500 in tests.
  - The `distance_bucket` column was too short; caught before the migration left the laptop.
- **Residual:** exposure fairness (D067); no popularity cap yet.

## Stage 7b status and build log

| screen | state | notes |
| --- | --- | --- |
| welcome | done | e2e and axe |
| sign-up | done | age gate on the India date before any request; consents; e2e |
| verify | done | code plus the remembered password (D045); resend; e2e |
| sign-in | done | screen tests |
| reset | partial | screen tests; no e2e yet; needs a real email provider |
| profile | done | empty, loading, error and filled states; honest labels; e2e |
| edit profile | done | the area picker is a long chip list (searchable picker later) |
| photos | done | picker, upload, reorder with buttons (no drag yet), delete; e2e upload |
| privacy | done | e2e |

- **Found and fixed:**
  - React Native Web ignored `accessibilityState`, so checkboxes had no checked state for screen readers on web. The axe scan caught it; the app now uses `role` and `aria-*` (D059).
  - TanStack Query's GC timers kept Jest alive for 5 minutes.
  - RNTL 14 needs `await` on `render` and events.
  - Flaky e2e locator in CI: the profile screen (still mounted under the photos screen) used the same image label as the photo list. The cover now has its own label, and the run is stable (4 local passes in a row).
- **Not done:**
  - A native device run (NAT-1: keystore, photo library, TalkBack and VoiceOver). Needs a device or an emulator with Expo Go or a dev build; the Android SDK exists on this laptop but isn't on PATH.
  - ESLint for the TypeScript code (typecheck only so far).
  - Hindi strings.

## Stage 7a status

- **Implemented and tested** (cases F02-*, PRF-*, IMG-1, PHO-* in `test-plan.md`): everything in the stage 7 brief except the app screens.
  - Persistence, permissions, invalid uploads and deletion are tested.
  - The real dev server, worker and local storage were exercised end to end.
- **Partial, by design:**
  - Photos stay pending; the review queue comes with moderation (stage 11).
  - Another member's profile is always a 404 until stages 8-9 add the daily set, matches and likes.
  - Visibility and pause are stored; discovery applies them (stage 8).
  - Storage is local disk until the owner sets up a bucket.
- **Fixed during the stage:** FastAPI's generated upload form allowed unknown fields (D055), caught by the OpenAPI meta-test.

## Stage 6 status

- **Implemented and tested** (cases F01-* and JOB-1 in `test-plan.md`): every flow in the stage 6 brief, via the API.
  - Authorization, rate limits (per email and per IP), validation and failure cases are tested.
  - The real worker runs end to end, and two concurrent verifications produce exactly one session.
- **Fixed from stage 5:** OpenAPI now documents errors as `application/problem+json`.
- **Partial, by design:**
  - No app screens yet (stage 7).
  - Email goes to the worker console in development; no real provider is connected.
  - SMS and identity checks are interfaces only.
  - Parity is 6.9/100, with 0 of 20 must-haves done (`parity.py`).
- **Residual:** enumeration timing is equalised by construction, not measured.
- **Deploy note (stage 17):** keep PostgreSQL's `log_parameter_max_length_on_error = 0` (the default) and `log_statement = none`. Failed statements are logged with placeholders only, as CI showed; parameter values would include emails.
- **Fixed during the stage:**
  - procrastinate renamed tasks when a second app was built (D046).
  - The model-level whitespace stripping would have trimmed passwords; password fields now keep spaces.

## Environment (owner's Windows 11 laptop, verified 2026-11-04)

- **Installed:** Node 22.23.4, npm 11.19, Python 3.13.7 (`py` launcher), uv 0.11.25, git 2.51, gh 2.81 (signed in, admin), JDK 25, Chrome 156, Edge 156.
- **Dev services (D034):**
  - PostgreSQL 17.5: a private cluster on port 55432, data in `%LOCALAPPDATA%\datingapp-dev\pg17`. Start it with `pg_ctl -D <dir> -l <dir>\..\pg17.log start` (PostgreSQL 17 `bin`).
  - Redis 7.0.15: in WSL2 on port 6380, `wsl -e redis-server --port 6380 --bind 127.0.0.1 --save '' --appendonly no --daemonize yes`. Neither starts automatically.
- **Untouched:** the owner's own PostgreSQL 17 and 18 services (5432, 5433).
- **Docker Desktop** now runs the closed beta (home mode, D097). Playwright drives the installed Chrome. The Android SDK is still not on PATH.
- **Memory:** 8 GB, and the beta, Docker's VM and test runs share it. On 2026-11-06 the WSL distro holding the test Redis stopped starting (`Wsl/Service/WSAETIMEDOUT`) with 0.1 GB free. A throwaway container (`docker run --rm -d --name e2e-test-redis -p 127.0.0.1:6380:6379 redis:7`) served the tests instead.
- **Tools:** Replica vendored (D031). REA `rea-agents` 6.8.0 is connected; only for our own builds (D005).
- **GitHub:** repo public (D032). Secret scanning and push protection are enabled. Dependabot alerts are on: 3 open in npm packages, `glob` and `minimatch` (moderate, published 2026-10-30) and `deepmerge` (low, no fix). **Assessed 2026-11-12 from the lockfile:** every affected copy comes in through Jest or Expo's CLI and fingerprint tools, which read only the project's own patterns and config; none ships in the app, the API or the website. The fixes need majors those tools don't accept yet (glob 14.0.2, minimatch 11.0.1), so they wait for Jest and Expo rather than forced overrides.

## Blockers / owner actions

0. **Before any deployment:** see `deploy.md` (release gates). Staff two-factor sign-in and the console are done (D090-D091) and need TLS in front of them. The first admin's bootstrap is in the deploy runbooks.
1. Dependabot alerts are on; 3 are open, all in test and build tools (Environment, assessed 2026-11-12). Security updates: unchecked.
2. **Email provider** (needed before any real sign-up; not blocking development):
   - choose one, for example Amazon SES in ap-south-1, Postmark or Resend;
   - verify a sending domain with SPF, DKIM and DMARC;
   - put the API key in `.env` or a secret manager.
   I then add and test the adapter.
3. **Legal documents:** terms and privacy notice, with legal review. Production refuses the current `draft-2026-11` versions (D044).
4. **Object storage** (needed before any real photo): a private bucket in an India region, for example S3 in ap-south-1 or Cloudflare R2, with an access key for the app. I then add and test the adapter with presigned GETs (D053).
5. SMS stays off until India DLT registration (entity, sender ID, templates) and an SMS provider exist (D012).
6. **Name:** Haanji failed screening on 2026-11-05: a matrimonial service (Radio Haanji's "Haanji Rishte") and a relationships check-in app use it, and every domain is taken. The lean is Kinaara (kinaara.in and kinaara.app are free). Next: the owner runs the IP India search (it needs a sign-in), then an attorney's opinion (`brand.md`).

## Next

Stage 20e is reviewed (impeccable: ship for its scored fixes), documented (`apps/mobile/DESIGN.md`) and live on the beta (2026-11-13, the member app only). The website and the waitlist are live too (2026-11-13). Next: a lawyer's review of the privacy notice and terms (owner, blocker 3), now that the public can join the waitlist; a few literal numbers remain outside the tokens (above). The `beta-images` workflow can now build the website and API images too (deploy.md), so their release needs no build on the laptop; a run of all three passed (43364994936). The new API image's newest migration is 0014 (the waitlist) and the live database is at 0013, so that release needs a backup and `migrate` first. Still open on devices: TalkBack itself (NAT-1). Owner setup (the email provider and its DNS, the private bucket; deploy.md, gates 1-2) remains the way to real sign-ups.
