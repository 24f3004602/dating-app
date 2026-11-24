// DEL-PAGE-1..3 (D150): the account-deletion page's numbers are the code's own, and the
// page names the app as its Google Play listing does. (Node strips the types from
// lib/deletion.ts.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { DELETION, storeTitle, years } from "../lib/deletion.ts";

const repo = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");

/** The API's periods in days: `NAME = timedelta(days=8 * 365)` gives NAME: 2920. */
function retentionDays() {
  const days = {};
  const source = read("apps/api/app/modules/privacy/retention.py");
  for (const [, name, unit, expr] of source.matchAll(/^(\w+) = timedelta\((days|hours)=([\d *]+)\)/gm)) {
    const n = expr.split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
    days[name] = unit === "days" ? n : n / 24;
  }
  return days;
}

test("DEL-PAGE-1: every period the page states from the API is the API's own", () => {
  const days = retentionDays();
  assert.ok(Object.keys(days).length >= 10, "the parser found the retention rules");
  assert.equal(DELETION.graceDays, days.ACCOUNT_GRACE);
  assert.equal(DELETION.reportHoldDays, days.REPORT_HOLD_MAX);
  assert.equal(DELETION.recordYears * 365, days.DELETED_ACCOUNT_RECORD);
  assert.equal(DELETION.reporterLinkDays, days.REPORTER_LINK);
  assert.equal(DELETION.reportYears * 365, days.RESOLVED_REPORT);
  assert.equal(DELETION.paymentYears * 365, days.PLUS_PAYMENT_RECORD);
  assert.equal(DELETION.unconfirmedDays, days.UNVERIFIED_ACCOUNT);
});

test("DEL-PAGE-2: the audit trail's years and the backups' days are their own files'", () => {
  const purge = read("apps/api/migrations/versions/0009_privacy.py");
  for (const table of ["audit_log", "moderation_actions"]) {
    const rule = `DELETE FROM ${table} WHERE created_at < now() - interval '${DELETION.auditYears} years'`;
    assert.ok(purge.includes(rule), table);
  }
  const backup = read("infra/beta/backup.sh");
  assert.match(backup, new RegExp(`^keep_days=\\$\\{BACKUP_KEEP_DAYS:-${DELETION.backupDays}\\}$`, "m"));
});

test("DEL-PAGE-3: the page names the app as its Play listing does; years read naturally", () => {
  const listing = JSON.parse(read("replica/launch/listing.json"));
  assert.equal(storeTitle("Kinaara"), listing.google_play.title);
  assert.deepEqual([1, 2, 8].map(years), ["1 year", "2 years", "8 years"]);
});
