// WEB-SET-1..2 (D147, D150, D155): a production website without API_URL, APP_URL, CONTACT_EMAIL
// or OPERATOR_NAME refuses to start, instead of pointing at 127.0.0.1, offering no way to reach us
// or naming no grievance officer; development and the build are left alone. (Node strips the types.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { missingSettings, REQUIRED_IN_PRODUCTION } from "../lib/requiredSettings.ts";

const prod = {
  NODE_ENV: "production",
  API_URL: "http://api:8000",
  APP_URL: "https://app.example.com",
  CONTACT_EMAIL: "contact@example.com",
  OPERATOR_NAME: "A. Operator",
};

test("WEB-SET-1: production needs API_URL, APP_URL, CONTACT_EMAIL and OPERATOR_NAME; blank counts as missing", () => {
  assert.deepEqual(REQUIRED_IN_PRODUCTION, ["API_URL", "APP_URL", "CONTACT_EMAIL", "OPERATOR_NAME"]);
  assert.deepEqual(missingSettings(prod), []);
  assert.deepEqual(missingSettings({ ...prod, APP_URL: undefined }), ["APP_URL"]);
  assert.deepEqual(missingSettings({ ...prod, API_URL: "  " }), ["API_URL"]);
  assert.deepEqual(missingSettings({ ...prod, CONTACT_EMAIL: "" }), ["CONTACT_EMAIL"]);
  assert.deepEqual(missingSettings({ ...prod, OPERATOR_NAME: " " }), ["OPERATOR_NAME"]);
  assert.deepEqual(missingSettings({ NODE_ENV: "production" }), ["API_URL", "APP_URL", "CONTACT_EMAIL", "OPERATOR_NAME"]);
});

test("WEB-SET-2: development and next build are never stopped; the server start checks", () => {
  assert.deepEqual(missingSettings({ NODE_ENV: "development" }), []);
  assert.deepEqual(missingSettings({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }), []);
  const hook = readFileSync(resolve(import.meta.dirname, "../instrumentation.ts"), "utf8");
  assert.match(hook, /process\.env\.NEXT_RUNTIME === "nodejs"/);
  assert.match(hook, /import\("\.\/instrumentation-node"\)/);
  const node = readFileSync(resolve(import.meta.dirname, "../instrumentation-node.ts"), "utf8");
  assert.match(node, /missingSettings\(process\.env\)/);
  assert.match(node, /process\.exit\(1\)/);
});
