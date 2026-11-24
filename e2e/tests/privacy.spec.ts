/**
 * Account deletion (D083) in the browser against the real API: a member who
 * never finished a profile deletes their account, is signed out to the date,
 * signs in again and keeps it, then deletes it for good. axe on every screen.
 * And the website's deletion page (D150, Google Play's rule): the way to delete
 * first, working without the app, then what's kept.
 */
import { expect, test } from "@playwright/test";

import { CONSOLE_URL, E2E_CONTACT_EMAIL, WEB_URL } from "../env";
import { checkA11y, PASSWORD, signUp, watchErrors } from "./helpers";

test("the website's deletion page puts the way first and leads into the web app (E2E-21)", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto(`${CONSOLE_URL}/privacy`); // reached from every document's footer
  await page.getByRole("contentinfo").getByRole("link", { name: "Delete your account" }).click();
  await expect(page).toHaveURL(`${CONSOLE_URL}/delete-account`);
  await expect(page.getByRole("heading", { name: "Delete your account", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/^Delete your account · /);
  // The app as its Play listing names it; the way to delete before anything else; a contact.
  await expect(page.getByText(/: Serious Dating, the Android app, and the web app at 127\.0\.0\.1:8772,/)).toBeVisible();
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual([
    "Delete it yourself",
    "If you can't sign in",
    "What happens",
    "What we delete",
    "What we keep, and for how long",
    "On the waitlist?",
  ]);
  await expect(page.getByRole("link", { name: E2E_CONTACT_EMAIL }).first()).toHaveAttribute(
    "href",
    `mailto:${E2E_CONTACT_EMAIL}`,
  );
  await checkA11y(page, "website delete-account");
  await page.screenshot({ path: "test-results/delete-account.png", fullPage: true }); // for review
  await page.setViewportSize({ width: 320, height: 700 }); // reflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  // Without the app: the button opens the web app's own sign-in.
  await page.getByRole("link", { name: "Sign in to delete your account" }).click();
  await expect(page).toHaveURL(`${WEB_URL}/sign-in`);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});

test("delete an account, keep it by signing in, delete it again", async ({ page }) => {
  const errors = await watchErrors(page);
  const email = `e2e-leaving-${Date.now()}@example.com`; // a labelled test account
  await signUp(page, email);

  // No profile needed: the way out is always there.
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delete your account" })).toBeVisible();
  await expect(page.getByText(/^After 7 days: your profile, photos, likes, matches, messages and blocks/)).toBeVisible();
  await expect(page.getByText(/^What deletion can't reach: emails we've already sent you, and our backups/)).toBeVisible();
  await checkA11y(page, "delete-account");

  const confirm = page.getByRole("button", { name: "Delete my account", exact: true });
  await confirm.click();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await page.getByLabel("Your password", { exact: true }).fill("not the right password");
  await confirm.click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();

  await page.getByLabel("Your password", { exact: true }).fill(PASSWORD);
  await confirm.click();
  const goodbye = page.getByText(/^Your account is hidden and you've been signed out\. Everything will be deleted on \d{4}-\d{2}-\d{2}/);
  await expect(goodbye).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fewer, better introductions" })).toBeVisible();
  await checkA11y(page, "welcome-after-deletion");

  // Signing in during the grace period offers to keep the account.
  await page.getByRole("button", { name: "I already have an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/^This account is waiting to be deleted\. Everything will be deleted on \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await checkA11y(page, "sign-in-deletion-scheduled");
  await page.getByRole("button", { name: "Keep my account" }).click();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();

  // Deleting again works the same way and ends signed out.
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByLabel("Your password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account", exact: true }).click();
  await expect(goodbye).toBeVisible();

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
