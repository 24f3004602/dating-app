/**
 * The web app stays signed in (D152): the session is the API's HttpOnly cookie, so a reload
 * keeps you in while no script on the page can read it. Signing out ends it; with "Keep me
 * signed in" off, the cookie ends with the browser (a shared computer).
 */
import { expect, test } from "@playwright/test";

import { API_URL } from "../env";
import { checkA11y, PASSWORD, signUp, watchErrors } from "./helpers";

const COOKIE = "__Host-session";

test("the web app stays signed in across a reload, and no script can read the session (E2E-22)", async ({ page, context }) => {
  const errors = await watchErrors(page);
  const email = `e2e-stays-${Date.now()}@example.com`; // a labelled test account
  await signUp(page, email); // ends on the empty profile, signed in

  // The session is the API's cookie: HttpOnly, Secure, SameSite=Strict, about 30 days.
  const session = (await context.cookies(API_URL)).find((c) => c.name === COOKIE);
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  expect(session?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);
  expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);

  // A reload keeps you in.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();

  // Signing out ends it: the cookie goes, and a reload shows the welcome.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const signInButton = page.getByRole("button", { name: "I already have an account" });
  await expect(signInButton).toBeVisible();
  expect((await context.cookies(API_URL)).find((c) => c.name === COOKIE)).toBeUndefined();
  await page.reload();
  await expect(signInButton).toBeVisible();

  // On a shared computer: "Keep me signed in" off, and the cookie ends with the browser.
  await signInButton.click();
  const keep = page.getByRole("checkbox", { name: "Keep me signed in on this browser" });
  await expect(keep).toBeChecked();
  await keep.click();
  await expect(keep).not.toBeChecked();
  await checkA11y(page, "sign-in with keep me signed in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();
  const browserOnly = (await context.cookies(API_URL)).find((c) => c.name === COOKIE);
  expect(browserOnly?.expires).toBe(-1); // no expiry: a cookie for this browser session only

  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});
