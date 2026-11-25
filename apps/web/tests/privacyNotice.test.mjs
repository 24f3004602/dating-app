// PRIV-DOC-1..4 (stage 28f, D159): the privacy notice's periods are the code's own, the documents
// type no period of their own, the terms' three-monthly reminder is the API's, and the documents'
// version is one version everywhere it is pinned. PRIV-DOC-5 (D163): the LGBTQ+ labels the notice
// names are the API's and the app's. (Node strips the types from the libs.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { DELETION, span } from "../lib/deletion.ts";

const repo = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");

/** The API's periods in days: `NAME = timedelta(days=8 * 365)` gives NAME: 2920. */
function retentionDays() {
  const days = {};
  for (const [, name, unit, expr] of read("apps/api/app/modules/privacy/retention.py").matchAll(
    /^(\w+) = timedelta\((days|hours)=([\d *]+)\)/gm,
  )) {
    const n = expr.split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
    days[name] = unit === "days" ? n : n / 24;
  }
  return days;
}

test("PRIV-DOC-1: the notice's other periods are the API's own", () => {
  const days = retentionDays();
  assert.equal(DELETION.bannedDays, days.BANNED_ACCOUNT);
  assert.equal(DELETION.closedChatDays, days.CLOSED_CONVERSATION);
  assert.equal(DELETION.callRecordDays, days.CALL_RECORD);
  assert.equal(DELETION.queueHours / 24, days.STALE_QUEUE_ENTRY);
  assert.equal(DELETION.unpaidPaymentDays, days.UNPAID_PLUS_PAYMENT);
  assert.equal(DELETION.waitlistLinkDays, days.WAITLIST_UNSENT);
  assert.equal(DELETION.waitlistAfterOpeningDays, days.WAITLIST_AFTER_OPENING);
  assert.equal(DELETION.waitlistMaxYears * 365, days.WAITLIST_MAX);
  // A session's life: the API's default, which the beta doesn't change.
  assert.match(read("apps/api/app/config.py"), new RegExp(`session_ttl_days: int = Field\\(default=${DELETION.sessionDays},`));
  assert.doesNotMatch(read("infra/beta/compose.yaml"), /SESSION_TTL_DAYS/);
  assert.equal(span(1, "hour"), "an hour");
  assert.equal(span(1, "year"), "a year");
  assert.equal(span(30, "day"), "30 days");
});

test("PRIV-DOC-2: the privacy notice types no period of its own; each comes from a constant", () => {
  const page = read("apps/web/app/privacy/page.tsx");
  assert.doesNotMatch(page, /\b\d+ (day|year|hour)s?\b/);
  assert.doesNotMatch(page, /\b(an hour|a year)\b/);
  for (const key of [
    "graceDays", "reportHoldDays", "recordYears", "reporterLinkDays", "reportYears", "auditYears", "paymentYears",
    "unconfirmedDays", "backupDays", "driveTrashDays", "securityLogYears", "bannedDays", "closedChatDays",
    "callRecordDays", "queueHours", "unpaidPaymentDays", "sessionDays", "waitlistLinkDays",
    "waitlistAfterOpeningDays", "waitlistMaxYears", "testEndDays",
  ]) {
    assert.match(page, new RegExp(`\\{(span\\()?D\\.${key}\\b`), key);
  }
  assert.match(page, /We answer within \{LIMITS\.resolve\}/); // the complaints page's own limit
});

test("PRIV-DOC-3: the terms' reminder every three months is what the API's job does", () => {
  const terms = read("apps/web/app/terms/page.tsx").replace(/\s+/g, " ");
  assert.ok(terms.includes("We remind you of these rules in the app at least every three months"));
  const service = read("apps/api/app/modules/notifications/service.py");
  const days = Number(/^RULES_REMINDER = timedelta\(days=(\d+)\)/m.exec(service)?.[1]);
  assert.ok(days > 0 && days <= 90, `three months is at least 90 days; the job reminds every ${days}`);
  assert.match(read("apps/api/app/modules/notifications/tasks.py"), /@blueprint\.periodic\(cron=NOTICES_CRON\)/);
  // Both documents promise to tell members in the app when they change: the job's other half.
  for (const doc of ["privacy", "terms"]) {
    const text = read(`apps/web/app/${doc}/page.tsx`).replace(/\s+/g, " ");
    assert.ok(text.includes("the new version is dated at the top, with what changed, and we tell you in the app"), doc);
  }
});

test("PRIV-DOC-4: one version of the documents, everywhere it is pinned", () => {
  const documents = read("apps/web/lib/documents.ts");
  const version = /export const BETA_VERSION = "(beta-(\d{4})-(\d{2})-(\d{2}))";/.exec(documents);
  assert.ok(version, "the website's version");
  const [, v, year, month, day] = version;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];
  assert.match(documents, new RegExp(`export const BETA_DATE = "${Number(day)} ${months[Number(month) - 1]} ${year}";`));
  const pins = {
    "infra/beta/compose.yaml": [`TERMS_VERSION: ${v}`, `PRIVACY_VERSION: ${v}`],
    "infra/beta/app.Dockerfile": [`ARG EXPO_PUBLIC_TERMS_VERSION=${v}`, `ARG EXPO_PUBLIC_PRIVACY_VERSION=${v}`],
    "apps/mobile/eas.json": [`"EXPO_PUBLIC_TERMS_VERSION": "${v}"`, `"EXPO_PUBLIC_PRIVACY_VERSION": "${v}"`],
    ".github/workflows/android-apk.yml": [`EXPO_PUBLIC_TERMS_VERSION=${v}`, `EXPO_PUBLIC_PRIVACY_VERSION=${v}`],
  };
  for (const [file, lines] of Object.entries(pins)) {
    const text = read(file);
    for (const line of lines) assert.ok(text.includes(line), `${file}: ${line}`);
    assert.equal(text.replaceAll(v, "").match(/beta-\d{4}-\d{2}-\d{2}/), null, `${file}: another version`);
  }
});

test("PRIV-DOC-5: the notice names every LGBTQ+ label the API accepts, and its limit; the app offers the same (D160, D163)", () => {
  const models = read("apps/api/app/modules/profiles/models.py");
  const body = /class Identity\(enum\.StrEnum\):([\s\S]*?)\n\n\n/.exec(models);
  assert.ok(body, "the API's Identity enum");
  const labels = [...body[1].matchAll(/^ {4}\w+ = "([a-z]+)"$/gm)].map((m) => m[1]);
  assert.ok(labels.length >= 5, "labels found");
  const max = Number(/^MAX_IDENTITIES = (\d+)$/m.exec(models)[1]);
  const words = ["no", "one", "two", "three", "four", "five", "six"];
  const notice = read("apps/web/app/privacy/page.tsx").replace(/\s+/g, " ");
  assert.ok(
    notice.includes(`up to ${words[max]} of ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}.`),
    "the notice lists the labels in the API's order, with the limit",
  );
  const app = /export const IDENTITIES = (\[[^\]]*\]) as const;/.exec(read("apps/mobile/src/validation/schemas.ts"));
  assert.deepEqual(JSON.parse(app[1]), labels);
});
