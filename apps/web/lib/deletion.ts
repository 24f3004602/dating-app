/**
 * The account-deletion page's facts (stage 27c, D150): how long things last before and
 * after an account is deleted. Each number is the code's own: the API's retention rules
 * (apps/api/app/modules/privacy/retention.py), the audit trail's database function
 * (migration 0009) and the beta's backups (infra/beta/backup.sh). tests/deletion.test.mjs
 * reads those files and fails when a number here drifts from them. No "server-only"
 * import: Node's test runner loads this file directly.
 */

/** Google Play asks the page to name the app as its store listing does (listing.json). */
export const storeTitle = (brand: string) => `${brand}: Serious Dating`;

export const DELETION = {
  /** Hidden at once, deleted after this; signing in before then can keep the account. */
  graceDays: 7,
  /** An open report about the account holds the deletion, at most this many more days. */
  reportHoldDays: 30,
  /** The record of the documents accepted, and for a banned account its email's keyed hash. */
  recordYears: 1,
  /** After a report is resolved, it stops naming who made it. */
  reporterLinkDays: 90,
  /** After a report is resolved, it is deleted. */
  reportYears: 2,
  /** Moderation decisions and the audit trail (a database function, migration 0009). */
  auditYears: 3,
  /** Plus payment records: accounting records, unlinked from the deleted account. */
  paymentYears: 8,
  /** A sign-up that never confirmed its email is deleted this long after it started. */
  unconfirmedDays: 7,
  /** Each daily backup, and its encrypted copy in Google Drive, is kept this long. */
  backupDays: 7,
  // Not the code's: Google Drive keeps a deleted file in its trash for 30 days, and the
  // security logs' year is the privacy inventory's rule for the log store.
  driveTrashDays: 30,
  securityLogYears: 1,
} as const;

export const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
