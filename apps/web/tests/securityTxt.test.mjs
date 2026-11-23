// SEC-TXT-1..3 (D145): /.well-known/security.txt (RFC 9116). The contact is the privacy
// notice's own; it expires in under a year and moves only once a day; no contact, no file.
// (Node strips the types from lib/securityTxt.ts.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { EXPIRES_DAYS, securityTxt } from "../lib/securityTxt.ts";

const evening = new Date("2026-11-23T16:25:00Z"); // 21:55 in India

test("SEC-TXT-1: the contact, an expiry, the languages and the canonical address, one field a line", () => {
  const text = securityTxt({ contact: "contact@example.com", site: "https://beta.test", now: evening });
  assert.equal(
    text,
    [
      "Contact: mailto:contact@example.com",
      "Expires: 2027-05-22T00:00:00.000Z",
      "Preferred-Languages: en, hi",
      "Canonical: https://beta.test/.well-known/security.txt",
      "",
    ].join("\n"),
  );
  for (const line of text.trimEnd().split("\n")) assert.match(line, /^[A-Z][A-Za-z-]+: \S/);
});

test("SEC-TXT-2: Expires is under a year away and the same all day (UTC)", () => {
  const expires = (now) => Date.parse(securityTxt({ contact: "a@b.c", site: null, now }).match(/^Expires: (.+)$/m)[1]);
  const days = (expires(evening) - evening.getTime()) / 86_400_000;
  assert.ok(days > EXPIRES_DAYS - 1 && days <= EXPIRES_DAYS && days < 365, `${days} days`);
  assert.equal(expires(new Date("2026-11-23T00:00:01Z")), expires(new Date("2026-11-23T23:59:59Z")));
  assert.equal(expires(new Date("2026-11-24T00:00:00Z")) - expires(evening), 86_400_000);
});

test("SEC-TXT-3: no contact, no file; no site address, no Canonical line; the route answers 404 then", () => {
  assert.equal(securityTxt({ contact: null, site: "https://beta.test", now: evening }), null);
  assert.equal(securityTxt({ contact: "", site: "https://beta.test", now: evening }), null);
  assert.doesNotMatch(securityTxt({ contact: "a@b.c", site: null, now: evening }), /Canonical/);
  const route = readFileSync(resolve(import.meta.dirname, "../app/.well-known/security.txt/route.ts"), "utf8");
  assert.match(route, /securityTxt\(\{ contact: CONTACT_EMAIL, site: SITE_URL, now: new Date\(\) \}\)/);
  assert.match(route, /status: 404/);
  assert.match(route, /text\/plain; charset=utf-8/);
});
