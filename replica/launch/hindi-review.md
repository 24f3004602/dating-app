# Hindi review sheet: the Hindi landing page

The website now shows one language per page (stage 22a, D120; the owner's request,
2026-11-13): English at `/`, Hindi at `/hi`, each linked from the top band. No Hindi is
written beside the English any more. This sheet lists every Hindi string on the Hindi
page, with the English beside it and where it shows, for a native Hindi speaker to
check before the Hindi page goes live. It is generated from `apps/web/lib/i18n/hi.ts`
and `en.ts`.

**What we'd like checked, line by line:**
- Is it correct, natural Hindi that a 22-34-year-old in Delhi NCR would read without
  stopping? Sign-length for names and labels; plain sentences for the rest.
- Does it say the same thing as the English? A freer wording is fine if it reads better;
  the meaning must not grow: no promises the English doesn't make.
- Tone: calm, plain and polite (आप, never तुम); no slang, no marketing exaggeration.
- Spelling and nukta (ज़, फ़, ड़), and whether an English word (प्रोफ़ाइल, चैट, लाइक, ब्लॉक,
  वेटलिस्ट, अकाउंट) or a Hindi one reads more naturally here.
- The page as a whole: does it read as one voice? Is any Hindi text too small to read
  comfortably on your phone?

**Already reviewed:** the lines you kept on 2026-11-13 are marked OK; some now appear in
two places (the map and the route). **New:** everything else.

**Said to be in English, on purpose:** the app's own labels ("Age declared", "email
verified", quoted as the app shows them), the privacy notice and the terms, and the
emails. The Hindi page names them as English where it links to them.

Write a better version in the last column, or "OK". Leave it empty if unsure.

| # | Hindi | English | Where it shows | Your version or "OK" |
| --- | --- | --- | --- | --- |
| 1 | कम, पर बेहतर परिचय | (the English tab shows only the name) | the browser tab's title |  |
| 2 | कम, पर बेहतर परिचय: हर दिन कुछ ऐसे लोग, जो वही चाहते हैं जो आप चाहते हैं। | Fewer, better introductions: a short daily set of people who want what you want. | the page description (search and link previews) |  |
| 3 | मुख्य सामग्री पर जाएँ | Skip to content | the skip link (keyboard users) |  |
| 4 | अभी शुरू नहीं हुआ | Not open yet | the status plate in the top band |  |
| 5 | कम, पर बेहतर परिचय। | Fewer, better introductions. | the main heading |  |
| 6 | रोज़ ज़्यादा से ज़्यादा 15 लोग, और सिर्फ़ वहीं, जहाँ आपकी चाहत उनकी चाहत से मेल खाए, दोनों तरफ़ से। | Up to 15 people a day, and only where what you want fits what they want, both ways. | the line under the main heading |  |
| 7 | एक रूट मैप: आपकी लाइन और किसी और की लाइन एक इंटरचेंज पर मिलती हैं, सिर्फ़ वहीं जहाँ आप दोनों एक-दूसरे से मेल खाते हों। | A route map: your line and someone else's line meet at one interchange, only where both of you fit. | the map's description for screen readers |  |
| 8 | आपकी लाइन | Your line | the phone map's labels | OK (reviewed 2026-11-13) |
| 9 | उनकी | Theirs | the phone map's labels | OK (reviewed 2026-11-13) |
| 10 | आपकी लाइन: आप क्या चाहते हैं | Your line: what you're looking for | the wide map's labels | OK (reviewed 2026-11-13) |
| 11 | उनकी लाइन: वे क्या चाहते हैं | Theirs: what they're looking for | the wide map's labels | OK (reviewed 2026-11-13) |
| 12 | दोनों तरफ़ से | Fit both ways | the label at the interchange (the two rings) | OK (reviewed 2026-11-13) |
| 13 | अगला स्टेशन: दिल्ली एनसीआर | Next stop: Delhi NCR | the heading over the first waitlist form | OK (reviewed 2026-11-13) |
| 14 | वेटलिस्ट में शामिल हों | Join the waitlist | the heading over the last waitlist form |  |
| 15 | आपका ईमेल पता | Your email address | the waitlist form |  |
| 16 | मेरी उम्र 18 साल या उससे ज़्यादा है | I'm 18 or over | the waitlist form |  |
| 17 | पुष्टि के लिए हम आपको एक ईमेल भेजेंगे (अंग्रेज़ी में), फिर बस एक बार, जब Kinaara शुरू होगा। इसके अलावा कुछ नहीं। | We'll email you to confirm, then once when Kinaara opens. Nothing else. | the waitlist form |  |
| 18 | गोपनीयता सूचना (अंग्रेज़ी में) | Privacy notice | the waitlist form |  |
| 19 | वेटलिस्ट में शामिल हों | Join the waitlist | the waitlist form |  |
| 20 | आपको जोड़ रहे हैं… | Adding you… | the waitlist form |  |
| 21 | धन्यवाद। अपनी जगह पक्की करने के लिए अपने इनबॉक्स में लिंक देखें; यह लिंक सिर्फ़ एक बार, 7 दिन तक काम करता है (हमारे ईमेल अंग्रेज़ी में होते हैं)। अगर आप पहले ही पुष्टि कर चुके हैं, तो आप लिस्ट में हैं और आपको कुछ और नहीं करना है। | Thanks. Check your inbox for a link to confirm your place; it works once, for 7 days. If you've already confirmed, you're on the list and there's nothing more to do. | the waitlist form's message after joining |  |
| 22 | कोई ईमेल पता लिखें, जैसे: name@example.com | Enter an email address, like name@example.com. | a waitlist form message (an error) |  |
| 23 | बॉक्स पर टिक करके पुष्टि करें कि आपकी उम्र 18 साल या उससे ज़्यादा है। | Tick the box to confirm you're 18 or over. | a waitlist form message (an error) |  |
| 24 | शामिल होने के लिए आपकी उम्र कम से कम 18 साल होनी चाहिए। | You must be 18 or over to join. | a waitlist form message (an error) |  |
| 25 | यह पेज पुराना हो गया है। इसे दोबारा लोड करके फिर कोशिश करें। | This page is out of date. Reload it and try again. | a waitlist form message (an error) |  |
| 26 | यहाँ से बहुत ज़्यादा कोशिशें हुई हैं। कृपया थोड़ी देर बाद फिर कोशिश करें। | Too many tries from here. Please wait a while and try again. | a waitlist form message (an error) |  |
| 27 | अभी हम आपको नहीं जोड़ पाए। कृपया एक मिनट बाद फिर कोशिश करें। | We couldn't add you just now. Please try again in a minute. | a waitlist form message (an error) |  |
| 28 | यह कैसे काम करता है, स्टेशन दर स्टेशन | How it works, stop by stop | the heading of the route |  |
| 29 | लाइन कैसे पढ़ें | How to read the line | the key's description for screen readers |  |
| 30 | आपकी लाइन | Your line | the key beside the route | OK (reviewed 2026-11-13) |
| 31 | उनकी | Theirs | the key beside the route | OK (reviewed 2026-11-13) |
| 32 | इंटरचेंज: आप एक-दूसरे से मेल खाते हैं | Interchange: you fit each other | the key beside the route |  |
| 33 | लाइन का आख़िरी स्टेशन | End of the line | the key beside the route |  |
| 34 | वेटलिस्ट की ओर | Towards the waitlist | the direction sign to the form | OK (reviewed 2026-11-13) |
| 35 | दोनों तरफ़ से | Fit both ways | a station's name on the route | OK (reviewed 2026-11-13) |
| 36 | आपके इरादे आपकी प्रोफ़ाइल का हिस्सा हैं, और इन्हें भरना ज़रूरी है। कोई आपकी लाइन पर तभी आता है, जब वह आपकी चाहत से मेल खाए और आप उसकी चाहत से: इरादे, पसंद और उम्र, तीनों दोनों तरफ़ से जाँचे जाते हैं। | Your intentions are part of your profile, and they're required. Someone joins your line only if they fit what you want and you fit what they want: intentions, preferences and age, checked both ways. | a station's text on the route |  |
| 37 | रोज़ 15 तक परिचय | Up to 15 introductions a day | a station's name on the route | OK (reviewed 2026-11-13) |
| 38 | पूरे दिन वही लोग, हर दिन नए। स्वाइप करने के लिए कोई ढेर नहीं। | The same set all day, a new one each day. No deck to swipe through. | a station's text on the route |  |
| 39 | रोज़ दस लाइक, सबके लिए | Ten likes a day, for everyone | a station's name on the route | OK (reviewed 2026-11-13) |
| 40 | हर सदस्य को वही दस मिलते हैं। ज़्यादा लाइक कभी बेचे नहीं जाते। | Every member gets the same ten. More likes are never for sale. | a station's text on the route |  |
| 41 | पहले जवाब, फिर और | Answer before you collect more | a station's name on the route | OK (reviewed 2026-11-13) |
| 42 | जब पाँच लोग आपके जवाब का इंतज़ार कर रहे हों, तो नए लाइक तब तक रुके रहते हैं, जब तक आप किसी को जवाब नहीं देते। | When five people are waiting for your reply, new likes pause until you answer someone. | a station's text on the route |  |
| 43 | सुरक्षा के टूल मुफ़्त | Safety tools are free | a station's name on the route | OK (reviewed 2026-11-13) |
| 44 | किसी भी प्रोफ़ाइल या चैट से ब्लॉक, रिपोर्ट और अनमैच करें। रिपोर्ट इंसान देखते हैं, और हर फ़ोटो किसी को दिखने से पहले जाँची जाती है। | Block, report and unmatch from any profile or chat. People review reports, and every photo is checked before anyone sees it. | a station's text on the route |  |
| 45 | लेबल पर सिर्फ़ वही, जो हमने जाँचा | Labels say only what we checked | a station's name on the route | OK (reviewed 2026-11-13) |
| 46 | “Age declared” (उम्र खुद बताई गई) और “email verified” (ईमेल की पुष्टि हुई), जैसा ऐप में दिखता है: जितना जाँचा गया, ठीक उतना ही, उससे ज़्यादा कभी नहीं। | “Age declared” and “email verified”: exactly what was checked, never more. | a station's text on the route |  |
| 47 | आपकी जगह मोटे तौर पर ही दिखती है | Your location stays vague | a station's name on the route | OK (reviewed 2026-11-13) |
| 48 | दूसरों को आपका इलाक़ा और दूरी का एक दायरा दिखता है, आपकी असली जगह कभी नहीं। | Others see your area and a distance range, never where you are. | a station's text on the route |  |
| 49 | जब चाहें, छोड़ दें | Leave whenever you like | a station's name on the route | OK (reviewed 2026-11-13) |
| 50 | ऐप में अपना अकाउंट डिलीट करें। आप तुरंत छिप जाते हैं, और 7 दिन बाद सब कुछ मिटा दिया जाता है, सिवाय उन सुरक्षा रिकॉर्ड के, जिनकी सूची गोपनीयता सूचना में है। | Delete your account in the app. You're hidden at once, and everything is deleted after 7 days, apart from the safety records the privacy notice lists. | a station's text on the route |  |
| 51 | फिर, बातचीत | Then, a conversation | the last station's name | OK (reviewed 2026-11-13) |
| 52 | चैट तभी खुलती है, जब आप दोनों एक-दूसरे को लाइक करें। लाइन यहीं तक ले जाती है। | Chat opens only when you both like each other. That's where the line leads. | the last station's text |  |
| 53 | वीडियो रोकें | Pause video | the button in the top band that pauses the candlelight video |  |
| 54 | Kinaara अभी एक अस्थायी नाम है। सिर्फ़ निमंत्रण वाले टेस्ट के लिए: | Kinaara is a working name. For the invite-only test: | the footer |  |
| 55 | टेस्टर्स के लिए शर्तें | terms for testers | the footer |  |
| 56 | और | and the | the footer |  |
| 57 | गोपनीयता सूचना | privacy notice | the footer |  |
| 58 | , दोनों अंग्रेज़ी में। किसी भी सार्वजनिक लॉन्च से पहले पूरे दस्तावेज़ आएँगे। | . Full documents will follow before any public launch. | the footer |  |

**Afterwards (engineering):** corrections go into `apps/web/lib/i18n/hi.ts`; then
`node scripts/devanagari-text.mjs` and `scripts/build_fonts.py` (the Devanagari fonts
hold only the letters the page uses; a test checks); then the website goes live with
the `beta-images` workflow and the owner's go (`deploy.md`).

**History:** 2026-11-13, the first sheet (16 lines beside the English, stage 20d):
the owner, a native Hindi speaker, kept all 16. The same day the owner asked for no
Hindi beside the English and a language option instead (D120); this sheet replaces it.
