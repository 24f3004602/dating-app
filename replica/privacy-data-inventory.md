# Privacy data inventory

Date: 2026-11-04. Status: **planned**. Nothing is collected yet. This is
the design that stage 12 implements and tests. Regulatory frame: India's DPDP
Act and Rules; core obligations apply from 2027-05-13 [recon 22]. This is not
legal advice: retention periods marked **(R)** need a lawyer's confirmation.

Principles:
- Collect the minimum.
- No precise location.
- No contact lists, ID documents or biometrics in the MVP.
- Consent is recorded with versions.
- Deletion is real, and every exception is listed below.

| data | purpose | source | stored in | who can see it | retention | when the account is deleted |
| --- | --- | --- | --- | --- | --- | --- |
| email | login, codes, service notices | member | `users` | the member; staff when handling a case | while the account exists | deleted. A keyed hash of a **banned** account's email is kept 1 year to stop immediate re-registration **(R)** |
| password | authentication | member | `users`, as an Argon2id hash only | nobody | while the account exists | deleted |
| birthdate | age gate (18+); show age | member | `users` | others see age in years only; staff see age | while the account exists | deleted. Under-18 attempts are never stored |
| display name, gender, interested in, intent, bio, prompt answers | matching and display | member | `profiles`, `profile_prompts` | eligible members (daily set, matches, people who liked them); staff for reports | while the account exists | deleted |
| area (coarse) | distance buckets, discovery | member choice from a list | `profiles.area_id` | others see the area name and a distance bucket, never coordinates | while the account exists | deleted |
| photos and derived sizes, plus an image hash | display; abuse signal (same photo on many accounts) | member | private object storage; `photos` | eligible members via signed URLs; staff | until the member deletes the photo | files and rows purged. The hash of a photo removed for abuse is kept 1 year **(R)** |
| likes, passes, like comments | matching | member actions | `interactions` | the target sees likes and comments; passes are private | while the account exists | deleted |
| matches | chat access | system | `matches` | both participants | until unmatched or an account is deleted | deleted, except where a report references them |
| messages | communication | members | `messages` | the two participants; staff only for reported messages, with minimal context | hidden at unmatch; purged after 30 days unless a report references them | purged, except evidence for open or recently resolved reports |
| read pointers | unread counts | system | `match_reads` | participants (read receipts are not shown in the MVP) | the life of the match | deleted |
| blocks | safety | member | `blocks` | the blocker only | while both accounts exist | deleted with the blocker's account |
| reports | safety | member | `reports` | the reporter (status only); staff | 2 years after resolution; the reporter's identity is pseudonymised once the report is resolved **(R)** | kept under the retention exception (safety and legal claims) |
| moderation actions, audit log | accountability | staff, system | `moderation_actions`, `audit_log` | admins | 3 years **(R)** | kept under the exception. The user ID is kept for bans so they can be enforced |
| consent records | proof of notice and consent (DPDP) | member | `consents` | the member; admins | the life of the account plus 1 year **(R)** | kept 1 year, then deleted |
| sessions | authentication | system | `sessions` (token hash, client type, timestamps, shortened user agent) | the member (device list, later) | expiry plus 30 days | deleted |
| one-time codes | verification | system | `one_time_codes` (HMAC only) | nobody | 24 hours after expiry | deleted |
| daily picks | discovery | system | `daily_picks` | the viewer | 7 days | deleted |
| rate-limit counters | abuse prevention | system | Redis | nobody | minutes to hours (TTL) | expire |
| security logs (truncated IP, route, status, user ID) | security, breach detection | system | log store | restricted engineers | 1 year (DPDP minimum for such logs), then deleted | kept under the exception, then deleted |
| backups | disaster recovery | system | provider backups | restricted engineers | 30-day rolling **(R)** | deleted data disappears when the backups age out; disclosed to members |

## External processors (planned; none connected yet)

| processor type | data shared | status |
| --- | --- | --- |
| email delivery | email address, code or notice text | to choose (stage 6). Check the provider's own log retention, which we cannot erase |
| cloud host, database, object storage | everything above, encrypted at rest by the provider | to choose. India region preferred |
| later: SMS, push, verification vendor, payments, error tracking | only what each needs | each requires a review and an inventory row before use |

## Member rights flows (stage 12)

| right | how | timing |
| --- | --- | --- |
| access | export of own data | target ≤ 7 days |
| correction | edit profile and email | immediate |
| erasure | account deletion; sessions revoked at once | data purged after the grace period |
| grievance | in-app and email contact | answer within the DPDP limit of 90 days |
| consent withdrawal | settings | stops further processing; may require account deletion |
