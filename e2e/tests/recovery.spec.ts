/**
 * Account recovery (F01) in the browser against the real API: forgot password,
 * a mailed code, a new password; the old one stops working. axe on each step.
 */
import { expect, test } from "@playwright/test";

import { checkA11y, codeFromWorkerMail, PASSWORD, signUp, watchErrors } from "./helpers";

const NEW_PASSWORD = "amber orchard pebble forty";

test("a forgotten password is reset with a mailed code", async ({ page }) => {
  const errors = watchErrors(page);
  const email = `e2e-forgot-${Date.now()}@example.com`; // a labelled test account
  await signUp(page, email);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "I already have an account" }).click();

  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await checkA11y(page, "reset-request");
  // The sign-in screen stays mounted (hidden) under this one, so only the visible field counts.
  await page.getByLabel("Email", { exact: true }).filter({ visible: true }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("If the address has an account, a code is on its way.")).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(await codeFromWorkerMail(email, "reset"));
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await checkA11y(page, "reset-confirm");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/^Password changed\. Every device was signed out/)).toBeVisible();

  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).filter({ visible: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("The email or password is not correct.")).toBeVisible(); // the old one is gone
  await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
