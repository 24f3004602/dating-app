# Briefing for a lawyer: Kinaara's closed beta, India

Date: 2026-11-24. Prepared for the owner to send to a lawyer in India (privacy and consumer law)
before any public launch (D146). It describes what the service does today, what it keeps and the
questions we need answered. It is a description, not legal advice, and where it says what a law
requires it is our reading, to be confirmed. The documents themselves are linked, not copied.

## 1. The service

- **What:** a dating app for adults (18+) in Delhi NCR: a short daily set of introductions, likes
  and passes, matches and one-to-one chat; **Live**, short random video calls with strangers whose
  preferences fit both ways (5 free calls of a minute, then the paid pass); safety tools (block,
  report, unmatch, a safety guide with helplines), moderation by staff, account deletion.
- **Where:** the website kinaara.online, the web app app.kinaara.online and an Android app
  (direct download for now; Google Play planned).
- **Who:** run by the owner as an individual during the closed beta (no company yet). Anyone 18
  or over can sign up; there is no marketing yet.
- **Money:** "Kinaara Plus", a 30-day pass for ₹299, paid by UPI straight to the owner's UPI ID;
  an admin confirms each payment against the bank before the pass starts. No automatic renewal.
  The Android app can show Google AdMob ads (non-personalised) to members without the pass; off
  until the app is on Google Play.
- **Hosting:** today, one computer at the owner's home behind Cloudflare's tunnel (no open
  ports); a server in AWS Mumbai is planned for the public launch.

## 2. The documents

- Privacy notice: https://kinaara.online/privacy (version `beta-2026-11-20`)
- Terms: https://kinaara.online/terms (the same version)
- Safety guide (in the app): what to watch for, and India's helplines (112, 181, 1930, 14416).

Members accept the current version at sign-up; each acceptance is stored with the version and
time (the consent records below). The documents are drafts written for the beta.

## 3. What we keep, and for how long

The full table is `replica/privacy-data-inventory.md` in the project. In short:

| data | kept |
| --- | --- |
| email, birthdate (age shown in years only), profile, photos (re-encoded, no location metadata), preferences, area (a coarse area, never a location) | while the account exists |
| likes, passes, matches, messages (plain text on our server; not end-to-end encrypted, and the app says so) | while both accounts exist; an ended match and its messages 30 days |
| reports (with a copy of a reported message) and moderation records | reporter's identity removed 90 days after a decision; moderation and audit records 3 years (to confirm) |
| consent records | the life of the account, then 1 year (to confirm) |
| Live calls | never recorded by us; a record of each call (the two members, when it was paired, connected and ended, how it ended) for 90 days (to confirm), longer only while an open report names it |
| Plus payments (code, amount, the UPI reference, dates) | 8 years as accounting records, unlinked from the account after deletion (to confirm) |
| security logs (truncated IP, route, status) | 1 year |
| backups (the database and photos) | 7 days on the computer, and an encrypted copy in the owner's Google Drive for 7 days (then up to 30 days in Drive's trash); only the owner holds the key |

**Deletion:** a member can delete the account in the app; it can be restored for 7 days, then
everything is purged except the listed exceptions (reports under review, consent proof, payment
records, a hash of a banned email for a year).

## 4. Who else handles data

| provider | what for | what it sees |
| --- | --- | --- |
| Google (Gmail) | sending sign-up and reset codes | the member's email address and the code |
| Google (Sign in with Google) | an optional way to sign in | Google's account identifier |
| Google AdMob | ads in the Android app (when switched on) | device and ad data, no account data |
| Cloudflare | the tunnel to the website; the relay for Live calls | connection data; call media passes through the relay, encrypted |
| Expo (and Google, Apple) | delivering notifications | a device token and a fixed sentence (no names or messages) |
| Google (Drive) | keeping the daily backup's encrypted copy (since 24 November) | encrypted files and their names, sizes and dates; not their contents (the key is only the owner's) |

No data processing agreements are signed yet; Gmail is a personal account, and Drive is the owner's own Google account. The privacy notice doesn't name Google Drive yet: its next version will.

## 5. Questions for you

**Data protection (DPDP Act 2023 and Rules 2025):**
1. Do the privacy notice and the consent at sign-up meet the notice and consent requirements?
   What must change before the obligations apply in full?
2. Retention periods marked "to confirm" above: are they right, and which laws set them
   (accounting records, security logs, moderation records)?
3. Cross-border processing: providers above are outside India. Is anything needed beyond saying
   so in the notice?
4. A personal data breach: we have a draft procedure (notify members and the Data Protection
   Board without delay). Is it complete, and what timelines apply?
5. Age: members declare a birthdate (18+); there is no ID check. Is self-declaration enough for an
   adults-only dating service, or do we need age assurance?

**Platform rules (IT Act and the Intermediary Guidelines 2021):**
6. Is Kinaara an intermediary, and what must we publish and do: a grievance officer, response
   times for complaints, removal of intimate images shared without consent, records? Since
   G.S.R. 120(E) (10 February 2026) the limits are 7 days to resolve, 36 hours for removal
   requests, 2 hours for intimate or impersonating images, 3 hours for orders, and a reminder of
   the rules every three months (D155; `kinaara.online/complaints` states them). Is an email
   address enough as the officer's contact, or must we publish a postal address? Does rule 3(3)
   (synthetically generated information) reach a dating app with no AI features, where members
   could upload AI-made photos?
7. Live calls with strangers: what duties do we have, and is our approach (video hidden until
   chosen, report ends the call, staff review, no recording by us) reasonable?
8. Requests from the police: what process should we follow and document?

**Consumers and payments:**
9. The Plus pass: do the terms meet consumer law (the E-Commerce Rules 2020, the 2023
   guidelines on dark patterns), including the refund wording?
10. Taking UPI payments to a personal UPI ID during the beta: what registration, invoicing and
    tax (GST) obligations apply, and when should a company take over?

**Other:**
11. Advertising: anything specific for dating ads in India (Google and Meta require their own
    certification, which we will apply for)?
12. The name "Kinaara": guidance on a trademark search and filing.
13. Is clickwrap acceptance with stored versions enough to bind members to the terms?
14. A new version of the documents (D159): we tell existing members in the app and let them carry on, and only new
    members agree to it at sign-up. Is telling enough, or must existing members accept a new version (DPDP)?
15. Language: rule 3(1)(b) of the IT Rules says the rules, privacy policy and user agreement are given "in English or
    any language specified in the Eighth Schedule ... in the language of his choice". Our documents are in English,
    and the Hindi home page says so. Do we need Hindi versions, and for which members?
16. The Data Protection Board of India: from when can members complain to it, and should the privacy notice name it
    now? Should the terms name a governing law and courts?
17. LGBTQ+ labels (D160): members may add up to three labels (trans, gay, lesbian, bisexual, queer and others) to
    their profile; they are optional, shown to whoever can see the profile, and not used for matching. The SPDI Rules
    2011 count sexual orientation as sensitive personal data; the DPDP Act has no such category. Is the member's own
    choice, with the form's note on who sees them, enough consent, and what must the privacy notice say?
18. The blue tick (D164): a member who asks for it sends a selfie, which our staff compare by eye with their
    photos (no face recognition), and which we delete at the decision. Is that biometric information under the SPDI
    Rules 2011, or sensitive in another way, and is the member's request at that moment enough consent?

## 6. What we would like from you

- A marked-up privacy notice and terms (or new versions) for the public launch.
- A short list of what must be in place before launch (registrations, officers, policies).
- Answers to the questions above, with the periods we should use.

Contact: the owner (the address on the privacy notice).
