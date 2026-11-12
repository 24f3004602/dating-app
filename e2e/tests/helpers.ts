/** Steps and checks shared by the specs. */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHOTO, WORKER_LOG } from "../env";

export const PASSWORD = "violet harbour lantern seventy";

/** The latest code mailed to `email` (the dev mail printer writes to the worker log). */
export async function codeFromWorkerMail(email: string, kind: "sign-up" | "reset" = "sign-up"): Promise<string> {
  const pattern = kind === "reset" ? /Your password reset code is (\d{6})/ : /Your code is (\d{6})/;
  for (let i = 0; i < 80; i++) {
    const log = readFileSync(WORKER_LOG, "utf8");
    const block = log.split("----- DEV EMAIL (not sent) -----").reverse().find((b) => b.includes(`To: ${email}`));
    const code = block?.match(pattern)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code mailed to ${email}`);
}

/** The path of the confirm or leave link in the latest waitlist email to `email` (D101). */
export async function waitlistLinkFromWorkerMail(email: string, kind: "confirm" | "leave"): Promise<string> {
  const pattern = new RegExp(`(/waitlist/${kind}[?]t=[A-Za-z0-9_.-]+)`);
  for (let i = 0; i < 80; i++) {
    const log = readFileSync(WORKER_LOG, "utf8");
    const block = log.split("----- DEV EMAIL (not sent) -----").reverse().find((b) => b.includes(`To: ${email}`));
    const path = block?.match(pattern)?.[1];
    if (path) return path;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no waitlist ${kind} link mailed to ${email}`);
}

/** Serious and critical WCAG A/AA issues fail the test. */
export async function checkA11y(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    blocking.map((v) => `${screen}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`),
  ).toEqual([]);
}

/**
 * Console errors and 5xx answers, to assert empty at the end of a spec. A breach of the
 * content security policy counts as a console error: Chrome doesn't always log one (an
 * `eval` refused inside a try is silent, BUG-002), so the page reports each itself.
 */
export async function watchErrors(page: Page) {
  const found = { console: [] as string[], server: [] as string[] };
  page.on("console", (m) => {
    // Chrome logs expected 4xx answers (e.g. "no profile yet") as resource errors; those are checked by the specs.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) found.console.push(m.text());
  });
  page.on("pageerror", (e) => found.console.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) found.server.push(`${r.status()} ${r.url()}`);
  });
  // Runs in every document the page opens, before the document's own scripts.
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP violation: ${e.effectiveDirective} refused ${e.blockedURI} (${e.sourceFile}:${e.lineNumber})`);
    });
  });
  return found;
}

/** Sign up as a 27-year-old and verify with the mailed code. Ends on the empty profile. */
export async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Day", { exact: true }).fill("1");
  await page.getByLabel("Month", { exact: true }).fill("1");
  await page.getByLabel("Year", { exact: true }).fill(String(new Date().getFullYear() - 27));
  await page.getByRole("checkbox", { name: "I accept the terms of use", exact: true }).click();
  await page.getByRole("checkbox", { name: "I have read the privacy notice", exact: true }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(await codeFromWorkerMail(email));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();
}

/** From the empty profile: a profile, then two photos. Ends on the profile, ready to be introduced. */
export async function readyProfile(page: Page, who: { name: string; gender: "Woman" | "Man"; seeking: "Woman" | "Man" }) {
  await page.getByRole("button", { name: "Create your profile" }).click();
  await page.getByLabel("First name", { exact: true }).fill(who.name);
  await page.getByRole("radio", { name: who.gender, exact: true }).click();
  await page.getByRole("checkbox", { name: who.seeking, exact: true }).click();
  await page.getByRole("radio", { name: "A long-term relationship", exact: true }).click();
  await page.getByRole("radio", { name: "Saket, Delhi", exact: true }).click();
  await page.getByRole("radio", { name: "The festival I look forward to all year", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("Holi, for the colours.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: `${who.name}, 27` })).toBeVisible();
  await page.getByRole("button", { name: "Photos" }).click();
  for (const n of [1, 2]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add a photo" }).click();
    await (await chooser).setFiles(PHOTO);
    await expect(page.locator(`[role="img"][aria-label="Your photo ${n} of ${n}"]`)).toBeVisible();
  }
  await page.goBack();
  await expect(page.getByText("Ready to be introduced")).toBeVisible();
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as an authenticator app computes it. */
export function totp(secretBase32: string, at: number = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
