# Hindi review sheet: the landing page

For a native Hindi speaker, before the Interchange landing page goes live (stage 20d,
D101-D103). The page is in English; every sign that names a place or a rule also carries
a short Hindi line under it, like a Delhi Metro sign. These 16 lines are the only Hindi
on the website. The member app shows no Hindi except, optionally, the name.

**What we'd like checked, line by line:**
- Is it correct, natural Hindi that a 22-34-year-old in Delhi NCR would read without
  stopping? Sign-length, not a sentence where a sign would do.
- Does it say the same thing as the English beside it? (A freer wording is fine if it
  reads better; the meaning must not grow: no promises the English doesn't make.)
- Tone: calm, plain and polite (आप, never तुम); no slang, no marketing exaggeration.
- Spelling and nukta (ज़, फ़), and whether an English word (लाइक, टूल, लेबल, वेटलिस्ट) or
  a Hindi one reads more naturally here.

Write a better version in the last column, or "OK". Leave it empty if unsure.

| # | Hindi now | English beside it | Where it shows | Your version or "OK" |
| --- | --- | --- | --- | --- |
| 1 | किनारा | Kinaara (the working name, "shore") | the top sign, only if the name is set in Devanagari | |
| 2 | दोनों तरफ़ से | Fit both ways | the first station, and the label where the two lines meet on the map | |
| 3 | रोज़ 15 तक परिचय | Up to 15 introductions a day | a station on the route | |
| 4 | रोज़ दस लाइक, सबके लिए | Ten likes a day, for everyone | a station on the route | |
| 5 | पहले जवाब, फिर और | Answer before you collect more (when five people wait for your reply, new likes pause) | a station on the route | |
| 6 | सुरक्षा के टूल मुफ़्त | Safety tools are free (block, report, unmatch) | a station on the route | |
| 7 | लेबल पर सिर्फ़ वही, जो हमने जाँचा | Labels say only what we checked ("age declared", "email verified") | a station on the route | |
| 8 | आपकी जगह मोटे तौर पर ही दिखती है | Your location stays vague (others see an area and a distance range) | a station on the route | |
| 9 | जब चाहें, छोड़ दें | Leave whenever you like (delete your account in the app) | a station on the route | |
| 10 | फिर, बातचीत | Then, a conversation | the last stop on the route | |
| 11 | आपकी लाइन: आप क्या चाहते हैं | Your line: what you're looking for | the map, by the teal line | |
| 12 | उनकी लाइन: वे क्या चाहते हैं | Theirs: what they're looking for | the map, by the marigold line | |
| 13 | आपकी लाइन | Your line | the small map's label | |
| 14 | उनकी | Theirs | the small map's label | |
| 15 | अगला स्टेशन: दिल्ली एनसीआर | Next stop: Delhi NCR | the heading over the waitlist form | |
| 16 | वेटलिस्ट की ओर | Towards the waitlist | a direction sign that points to the form | |

**Afterwards (engineering):** the corrected lines go into `apps/web/app/page.tsx` and
`apps/web/app/RouteDiagram.tsx`, and into `apps/web/scripts/devanagari-text.txt`. The
website's Devanagari font holds only the letters in that file, so it is rebuilt with
`apps/web/scripts/build_fonts.py` whenever a line changes; a letter missing from the font
would show in a fallback face. Then the website goes live with the `beta-images`
workflow and the owner's go (`deploy.md`).
