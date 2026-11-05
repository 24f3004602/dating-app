/**
 * Account deletion (D083) in the browser against the real API: a member who
 * never finished a profile deletes their account, is signed out to the date,
 * signs in again and keeps it, then deletes it for good. axe on every screen.
 */
import { expect, test } from "@playwright/test";

import { checkA11y, PASSWORD, signUp, watchErrors } from "./helpers";

test("delete an account, keep it by signing in, delete it again", async ({ page }) => {
  const errors = watchErrors(page);
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
