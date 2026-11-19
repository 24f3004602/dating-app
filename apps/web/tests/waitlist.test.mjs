// WEB-WL-4..5 (stage 20d, D101-D102): the waitlist links already emailed. WEB-WL-1..3
// tested the join form, gone since sign-up opened (D133).
import assert from "node:assert/strict";
import { test } from "node:test";

import { linkToken, tokenOutcome } from "../lib/waitlist.ts";

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
