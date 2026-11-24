// COMPLAINTS-1..2 (stage 28d, D155): the complaints page states the IT Rules' limits as amended
// on 10 February 2026 (MeitY's consolidated text, read 2026-11-24), only from lib/complaints.ts,
// and the home page in both languages and every document's footer link to it (rule 3(2)(a) and
// its Explanation). (Node strips the types from lib/complaints.ts.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { GAC_URL, LIMITS, RULES_AMENDED, URGENT_SUBJECT } from "../lib/complaints.ts";

const read = (path) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("COMPLAINTS-1: the rules' limits, stated only through lib/complaints.ts", () => {
  // Rule 3(2)(a)(i), its proviso, rule 3(2)(b) and rule 3A(3), as G.S.R. 120(E) left them.
  assert.deepEqual(LIMITS, {
    acknowledge: "24 hours",
    resolve: "7 days",
    removal: "36 hours",
    intimate: "2 hours",
    appeal: "30 days",
  });
  assert.equal(RULES_AMENDED, "10 February 2026");
  assert.equal(GAC_URL, "https://gac.gov.in");
  assert.equal(URGENT_SUBJECT, "Urgent: image");

  const page = read("app/complaints/page.tsx");
  for (const key of Object.keys(LIMITS)) assert.match(page, new RegExp(`\\{LIMITS\\.${key}\\}`), key);
  assert.match(page, /\{RULES_AMENDED\}/);
  // No number of hours or days typed into the page itself, where it could go stale.
  assert.doesNotMatch(page, /\b\d+ (hours?|days?)\b/);
  // The officer is named (the operator, which production requires) and can be written to.
  assert.match(page, /<strong>Grievance officer:<\/strong> \{OPERATOR\}/);
  assert.match(page, /<Contact \/>/);
  assert.match(page, /href=\{GAC_URL\}/);
  assert.match(read("lib/requiredSettings.ts"), /"OPERATOR_NAME"/);
});

test("COMPLAINTS-2: the home page, in English and Hindi, and every document link to it", () => {
  const landing = read("app/Landing.tsx");
  assert.match(landing, /<Link href="\/complaints" hrefLang=\{docLang\}>\s*\{t\.footer\.complaints\}/);
  assert.match(landing, /<Link href="\/android" hrefLang=\{docLang\}>\s*\{t\.footer\.android\}/);
  assert.match(read("lib/i18n/en.ts"), /complaints: "Complaints and the grievance officer"/);
  assert.match(read("lib/i18n/hi.ts"), /complaints: "शिकायतें और शिकायत अधिकारी"/);
  assert.match(read("app/DocumentPage.tsx"), /<Link href="\/complaints">Complaints<\/Link>/);
});
