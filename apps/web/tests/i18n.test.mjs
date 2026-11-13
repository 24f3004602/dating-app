// LANG-1..6 (stage 22a, D120; the owner's request): one language per page. English at
// /, Hindi at /hi, never one written beside the other; the two dictionaries match; the
// lines the owner reviewed stay word for word; the form answers in the page's language.
// (Node strips the types.)
import assert from "node:assert/strict";
import { test } from "node:test";

import { langForPath, messages } from "../lib/i18n/index.ts";
import { joinOutcome, validateJoin } from "../lib/waitlist.ts";

const en = messages("en");
const hi = messages("hi");
const DEVANAGARI = /[ऀ-ॿ]/;

/** Every string in a dictionary, with its path; functions are called with a sample name. */
function strings(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[`${path}()`, value("Kinaara")]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

/** The dictionary's shape: its keys, array lengths and flags, without the words. */
function shape(value) {
  if (typeof value === "string" || typeof value === "function") return typeof value;
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "boolean" ? v : shape(v)]));
  return value;
}

test("LANG-1: both dictionaries have the same shape: every word has its translation", () => {
  assert.deepEqual(shape(hi), shape(en));
  assert.equal(en.other.lang, "hi");
  assert.equal(hi.other.lang, "en");
});

test("LANG-2: the English page has no Devanagari but the language option's own name", () => {
  const found = strings(en).filter(([, s]) => DEVANAGARI.test(s));
  assert.deepEqual(found, [["other.name", "हिन्दी"]]);
});

test("LANG-3: every Hindi word is in Devanagari, except the option back to English", () => {
  const latinOnly = strings(hi).filter(([path, s]) => s && !DEVANAGARI.test(s) && path !== "lang" && path !== "other.lang");
  assert.deepEqual(latinOnly, [["other.name", "English"]]);
  for (const [path, s] of strings(hi)) assert.ok(path === "lang" || path === "other.lang" || s.trim().length > 0, path);
});

test("LANG-4: the 16 lines the owner reviewed (2026-11-13) are used word for word", () => {
  assert.deepEqual(
    hi.stations.map((s) => s.title),
    ["दोनों तरफ़ से", "रोज़ 15 तक परिचय", "रोज़ दस लाइक, सबके लिए", "पहले जवाब, फिर और", "सुरक्षा के टूल मुफ़्त", "लेबल पर सिर्फ़ वही, जो हमने जाँचा", "आपकी जगह मोटे तौर पर ही दिखती है", "जब चाहें, छोड़ दें"],
  );
  assert.equal(hi.terminus.title, "फिर, बातचीत");
  assert.deepEqual(
    [hi.map.yourLineLong, hi.map.theirsLong, hi.map.yourLine, hi.map.theirs, hi.map.bothWays, hi.join.heading, hi.route.towards],
    ["आपकी लाइन: आप क्या चाहते हैं", "उनकी लाइन: वे क्या चाहते हैं", "आपकी लाइन", "उनकी", "दोनों तरफ़ से", "अगला स्टेशन: दिल्ली एनसीआर", "वेटलिस्ट की ओर"],
  );
});

test("LANG-5: only the landing page's own path is Hindi", () => {
  assert.equal(langForPath("/hi"), "hi");
  assert.equal(langForPath("/hi/"), "hi");
  for (const path of ["/", "/privacy", "/terms", "/hi/anything", "/hindi", "/admin", "/waitlist/confirm"]) assert.equal(langForPath(path), "en", path);
});

test("LANG-6: the form answers in the page's language, and never claims an email was sent", () => {
  const bad = validateJoin("not-an-address", "yes", "hi");
  assert.equal(bad.ok, false);
  assert.equal(bad.state.message, hi.form.errors.email);
  assert.equal(validateJoin("a@example.com", undefined, "hi").state.message, hi.form.errors.adult);
  const done = joinOutcome(202, "", "a@example.com", "hi");
  assert.equal(done.message, hi.form.done);
  // "Sent" in Hindi: भेजा / भेज दिया / भेजी (the API answers the same for every address).
  assert.doesNotMatch(done.message, /भेजा|भेज दिया|भेजी/);
  assert.equal(joinOutcome(422, "underage", "a@example.com", "hi").message, hi.form.errors.underage);
  assert.equal(joinOutcome(429, "", "a@example.com", "hi").message, hi.form.errors.tooMany);
  assert.equal(joinOutcome(503, "", "a@example.com", "hi").message, hi.form.errors.unavailable);
  // English stays the default, as before.
  assert.equal(joinOutcome(202, "", "a@example.com").message, en.form.done);
});
