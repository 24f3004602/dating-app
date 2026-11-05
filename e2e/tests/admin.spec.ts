/**
 * The Next.js site (stage 14): the landing page, and the staff console with
 * two-factor sign-in against the real API. The console is protected on the
 * server: no cookie, a forged cookie or a signed-out session all land on the
 * sign-in page. Cookie flags, security headers and axe on every screen.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { apiEnv, CONSOLE_URL } from "../env";
import { checkA11y, PASSWORD, totp, watchErrors } from "./helpers";

type Fixture = { email: string; enrollment_token: string; report_id: string };

function staffFixture(): Fixture {
  const out = execFileSync("uv", ["run", "python", "scripts/e2e_staff.py", "--password", PASSWORD], {
    cwd: resolve(__dirname, "../../apps/api"),
    env: { ...process.env, ...apiEnv(process.env.E2E_RUN_ID ?? "run") },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as Fixture;
}

test.use({ baseURL: CONSOLE_URL });

test("the landing page says only what the app does", async ({ page }) => {
  const errors = watchErrors(page);
  const res = await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fewer, better introductions", level: 1 })).toBeVisible();
  await expect(page.getByText("Not open yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The same likes for everyone" })).toBeVisible();
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
  expect(res?.headers()["x-powered-by"]).toBeUndefined();
  await checkA11y(page, "landing");
  await page.screenshot({ path: "test-results/landing.png", fullPage: true }); // for review
  await page.setViewportSize({ width: 320, height: 700 }); // reflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(errors.console).toEqual([]);
});

test("the tester notice pages are linked, readable and accessible", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("link", { name: "privacy notice for testers" }).click();
  await expect(page.getByRole("heading", { name: "Privacy notice for testers", level: 1 })).toBeVisible();
  await expect(page.getByText(/Version beta-2026-11/)).toBeVisible();
  await expect(page.getByText(/never your messages/i)).toBeVisible();
  await checkA11y(page, "privacy");
  await page.getByRole("link", { name: "Terms for testers" }).click();
  await expect(page.getByRole("heading", { name: "Terms for testers", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "You are 18 or over." })).toBeVisible();
  await checkA11y(page, "terms");
  await page.setViewportSize({ width: 320, height: 700 }); // reflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(errors.console).toEqual([]);
});

test("an unknown page is a plain 404 that keeps the policy", async ({ page }) => {
  const errors = watchErrors(page);
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  expect(res?.headers()["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  await checkA11y(page, "not-found");
  expect(errors.console).toEqual([]); // no scripts blocked by the policy
});

test("staff sign in with a second factor and work the queue", async ({ page, context, request }) => {
  /** The console page, requested with this staff cookie and no browser state. */
  const consoleWith = async (token: string) => {
    const res = await request.get("/admin/photos", { headers: { cookie: `__Host-staff=${token}` }, maxRedirects: 0 });
    return res.status() === 200 ? { status: 200 } : { status: res.status(), location: res.headers()["location"] };
  };
  expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082"); // RFC 6238 vector
  const errors = watchErrors(page);
  const fixture = staffFixture();

  // Protected on the server: no cookie, or a forged one, means the sign-in page.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await consoleWith("forged")).toEqual({ status: 307, location: "/admin/login" });
  await checkA11y(page, "staff-sign-in");

  // Step 1: the password. A wrong one says nothing about the account.
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill("not the right password");
  await page.getByRole("button", { name: "Continue" }).click();
  // (Next.js's route announcer is an alert too, hence the filter.)
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is not correct." })).toBeVisible();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: no authenticator yet, so an enrolment token is needed.
  await page.getByLabel("Enrolment token").fill(fixture.enrollment_token);
  await page.getByRole("button", { name: "Set up my authenticator" }).click();
  const secret = (await page.getByLabel("Authenticator key").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.getByRole("link", { name: "Open in an authenticator app" })).toHaveAttribute("href", /^otpauth:\/\/totp\//);
  await checkA11y(page, "staff-enrol");
  await page.getByLabel("Code from the app").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm and sign in" }).click();

  // Recovery codes, once.
  const codes = page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  await checkA11y(page, "staff-recovery-codes");
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-staff");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  expect((await context.cookies()).some((c) => c.name === "__Host-staff-step")).toBe(false); // the challenge is gone
  await page.getByRole("link", { name: /open the console/ }).click();

  // The queue, and the report.
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await checkA11y(page, "console-queue");
  await page.getByRole("link", { name: "Fake profile" }).first().click();
  await expect(page.getByText("E2E test report between two labelled fixtures.")).toBeVisible();
  await checkA11y(page, "console-report");
  await page.screenshot({ path: "test-results/console-report.png", fullPage: true }); // for review
  await page.getByLabel("Action").selectOption("dismiss");
  await page.getByLabel(/Note for other staff/).fill("Labelled test data.");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("status")).toHaveText("Report dismissed.");
  await expect(page.getByText("Dismissed", { exact: true })).toBeVisible();

  // Photos, the audit log and staff (admin pages).
  await page.getByRole("link", { name: "Photos" }).click();
  await expect(page.getByRole("heading", { name: "Photo review", level: 1 })).toBeVisible();
  await checkA11y(page, "console-photos");
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByText("staff.login", { exact: true }).first()).toBeVisible();
  await checkA11y(page, "console-audit");
  await page.getByRole("link", { name: "Staff" }).click();
  await expect(page.getByText("Another admin resets yours")).toBeVisible();
  await page.getByRole("button", { name: /^Reset the authenticator for fixture-moderator-01/ }).click();
  await expect(page.getByRole("status").getByText(/^[A-Za-z0-9_-]{40,}$/)).toBeVisible();
  await checkA11y(page, "console-staff");

  // Sign out: the cookie goes, and the console is closed again.
  const before = cookie?.value ?? "";
  expect((await consoleWith(before)).status).toBe(200); // the session works...
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await context.cookies()).some((c) => c.name === "__Host-staff")).toBe(false);
  // ...and after signing out it is revoked by the API, not just forgotten by the browser.
  expect(await consoleWith(before)).toEqual({ status: 307, location: "/admin/login" });

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
