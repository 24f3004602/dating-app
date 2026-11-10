// WEB-WL-1..5 (stage 20d, D101-D102): the waitlist form's rules and words.
import assert from "node:assert/strict";
import { test } from "node:test";

import { joinOutcome, linkToken, tokenOutcome, validateJoin } from "../lib/waitlist.ts";

test("WEB-WL-1: an address and the 18+ box are both needed, and what was typed is kept", () => {
  assert.deepEqual(validateJoin(" asha@example.com ", "yes"), { ok: true, email: "asha@example.com" });
  for (const bad of ["", "asha", "asha@example", "a b@example.com", undefined, `${"a".repeat(250)}@example.com`]) {
    const r = validateJoin(bad, "yes");
    assert.equal(r.ok, false);
    assert.equal(r.state.field, "email");
  }
  const noBox = validateJoin("asha@example.com", null);
  assert.equal(noBox.ok, false);
  assert.equal(noBox.state.field, "adult");
  assert.equal(noBox.state.email, "asha@example.com");
});

test("WEB-WL-2: success never claims an email was sent (the API answers the same for every address)", () => {
  const done = joinOutcome(202, "", "asha@example.com");
  assert.equal(done.status, "done");
  assert.doesNotMatch(done.message, /we('ve| have) sent|we sent/i);
  assert.match(done.message, /already confirmed/i); // true for an address that is already on the list
});

test("WEB-WL-3: each API error names the problem and what to do", () => {
  assert.equal(joinOutcome(422, "underage", "x@example.com").field, "adult");
  assert.match(joinOutcome(422, "consent_required", "x@example.com").message, /Reload/);
  assert.equal(joinOutcome(422, "validation_error", "x@example.com").field, "email");
  assert.match(joinOutcome(429, "rate_limited", "x@example.com").message, /wait/);
  assert.match(joinOutcome(503, "rate_limit_unavailable", "x@example.com").message, /try again/);
  assert.match(joinOutcome(0, "network_error", "x@example.com").message, /try again/);
});

test("WEB-WL-4: confirm and leave outcomes", () => {
  assert.match(tokenOutcome("confirm", 204, "", "Kinaara").message, /once, when Kinaara opens/);
  assert.match(tokenOutcome("leave", 204, "", "Kinaara").message, /deleted/);
  assert.match(tokenOutcome("confirm", 400, "invalid_link", "Kinaara").message, /expired or has already been used/);
  assert.equal(tokenOutcome("leave", 500, "error", "Kinaara").status, "error");
});

test("WEB-WL-5: only a well-formed token from the link is used", () => {
  const token = "Abc_def-123.XYZ456789";
  assert.equal(linkToken(token), token);
  assert.equal(linkToken([token, "other"]), token);
  for (const bad of [undefined, "", "short", "has space in it 12345", "a".repeat(129), "<script>alert(1)</script>xx"]) {
    assert.equal(linkToken(bad), null, String(bad));
  }
});
