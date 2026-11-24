# Google Play Console: what to enter, and what must exist first

Started 2026-11-24 (stage 27, the owner's "start with Google Play", D146). For the owner to paste
into Play Console once the account exists. The answers come from the app's real data flows
(`replica/privacy-data-inventory.md`); anything marked **to confirm** must be checked against the
form's own wording on the day, because Play changes it. Nothing here is submitted yet.

## 1. Build rules (checked)

| rule (source, read 2026-11-24) | the app | how it's checked |
| --- | --- | --- |
| New apps and updates target API 36 since 31 August 2026 (developer.android.com/google/play/requirements/target-sdk) | **targetSdkVersion 36**, minSdkVersion 24 (Expo SDK 58's defaults) | `apps/mobile/scripts/apk_check.py`, in every `android-apk` build |
| Apps targeting Android 15+ support 16 KB memory pages; updates without it are refused from 1 February 2027 (developer.android.com/guide/practices/page-sizes) | **all 27 native libraries ready** (zip offsets, ELF alignment, RELRO pages), WebRTC's 12 MB library included | the same check; it agrees with Google's four documented RELRO examples (unit tests) |
| An app bundle (AAB) signed with an upload key; Google keeps the app signing key (Play App Signing) | **not built yet**: CI builds an APK | needs the owner's decision on where the upload key lives (section 5) |

## 2. Data safety form (draft)

**Collected** (sent off the phone) and **not shared** (no one else gets it for their own use;
service providers working for us, such as Cloudflare's relay, Gmail sending codes and Google Drive
holding the encrypted backups, don't count as sharing):

| Play's data type | what it is here | required? | purposes |
| --- | --- | --- | --- |
| Personal info: Name | the display name | yes | App functionality |
| Personal info: Email address | sign-in, codes, notices | yes | App functionality, Account management |
| Personal info: User IDs | the account's ID | yes | App functionality, Account management |
| Personal info: Sexual orientation | who the member is interested in | yes | App functionality (matching) |
| Personal info: Other info | birthdate (age shown in years), gender, intent | yes | App functionality |
| Location: Approximate location | the area the member picks from a list (never the phone's location) | yes | App functionality |
| Messages: Other in-app messages | chat messages | no | App functionality |
| Photos and videos: Photos | profile photos (re-encoded, no metadata) | yes | App functionality |
| Photos and videos: Videos; Audio: Voice or sound recordings | Live calls: between the two phones, encrypted, through a relay, never recorded or kept | no | App functionality; **to confirm** whether Play counts it (ephemeral and encrypted between the phones) |
| App activity: App interactions | likes, passes, matches, blocks | yes | App functionality |
| App activity: Other user-generated content | bio, prompt answers, reports | no | App functionality, Fraud prevention, security, and compliance |

**Collected and shared, only while ads are on** (Google AdMob, D137): device or other IDs (the
advertising ID), approximate location from the IP address, app interactions with ads,
diagnostics. **To confirm** against Google's own "Data disclosure" page for the Google Mobile Ads
SDK on the day, and leave it out if the Play build ships with ads off.

**Security practices:** data encrypted in transit: yes (HTTPS everywhere; Live calls DTLS-SRTP).
Users can ask for their data to be deleted: yes (in the app, and the web page in section 4).
Independent security review: no. Families policy: not applicable (adults only).

## 3. Other declarations (draft)

- **Target audience:** 18 and over only.
- **Content rating (IARC questionnaire):** users interact and exchange messages, photos and live
  video: yes; the app shares a user's precise location: no (an area only); digital purchases:
  none in the Play build (section 4); no violence, gambling or drugs content of its own.
  **To confirm:** the questionnaire's own questions on the day.
- **Ads:** "Contains ads" only if the Play build has them on (D137: real ads need the app public
  on Play and the owner's AdMob IDs; the closed test can go without).
- **App access:** sign-in is needed. Reviewers need an account that isn't shown to members as a
  person (section 5).
- **Not applicable:** news, government, financial features, health, COVID-19, VPN.

## 4. To build before the first upload

1. **A web page for account deletion** (Play: the page must let people ask for deletion without
   the app, name the app as on Play, and say what is kept and for how long): **built and tested
   (stage 27c, D150); live after the website's next release.** The form's "Delete account URL":
   `https://kinaara.online/delete-account`. It names "Kinaara: Serious Dating", puts the way
   first (in the app; or sign in to the web app, with a button), then those who can't sign in
   (password reset, Google, or write from the account's address: `datingapp-api delete-account`,
   deploy.md), what happens, what is deleted, and what is kept and for how long.
2. **A Play build without the UPI pass:** Play's payments policy covers digital features sold in
   the app; Plus is sold by UPI to the owner (D123), so the Play build mustn't offer or link to it
   until Play Billing (or Play's user choice billing in India) is in. The web app keeps the pass.
3. **The documents' next version** (a new version needs a new app build anyway, D139): Google
   Drive's encrypted backup copy (D149), the deletion page, and the Play build's differences.
4. **The app bundle**, signed with the upload key (section 5), and checked by `apk_check.py` on
   the APKs Play makes from it (bundletool) before the first upload.

## 5. The owner's decisions and steps

- **Where the upload key lives:** (a) a GitHub Actions secret, used only by a hand-started
  workflow on `main` behind a protected environment, with the key and its passwords also in the
  password manager; or (b) on this laptop, signing by hand (needs Java, and memory is tight).
  Recommended: (a). A lost or leaked upload key can be replaced through Play support; the app
  signing key stays with Google.
- **A reviewers' account:** an account Google's reviewers can use, kept out of every member's
  introductions (discovery paused from the start) so no member sees it as a person. Next, after
  item 1.
- **Play Console** (deploy.md, step list given 2026-11-24): the account, the $25 fee, identity
  checks; then 12 or more testers for 14 days of closed testing.
- **Google sign-in on Android** needs its own OAuth client with the SHA-1 of Play's app signing
  key, which Play Console shows once the app exists.
