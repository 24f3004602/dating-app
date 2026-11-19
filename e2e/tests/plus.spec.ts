/**
 * E2E-17 (D127): the Plus pass, paid by UPI, in the web app. A member ready for Live opens
 * Plus from the Live screen, starts a payment and sees how to pay: the payee, the UPI link
 * and its QR code (a data URL, under the app's own CSP), the note to keep. A made-up
 * reference is refused until it has 12 digits, then sent; the screen says it is being
 * checked. Nobody pays anything here; an admin's approval is in admin.spec.ts.
 */
import { expect, test } from "@playwright/test";

import { checkA11y, readyProfile, signUp, watchErrors } from "./helpers";

test("a member pays for Plus by UPI and sends the payment's reference", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await watchErrors(page);
  await signUp(page, `e2e-plus-${Date.now()}@example.com`); // a labelled test account
  await readyProfile(page, { name: "Meera", gender: "Woman", seeking: "Man" });

  await page.getByRole("tab", { name: "Live" }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByRole("button", { name: /^See .* Plus$/ }).click();
  await expect(page.getByRole("heading", { name: "₹299 for 30 days" })).toBeVisible();
  await checkA11y(page, "plus-pass");

  await page.getByRole("button", { name: "Pay ₹299 by UPI" }).click();
  await expect(page.getByText("1. Pay exactly ₹299 to E2E Payee, UPI ID e2e.payee@example.")).toBeVisible();
  // react-native-web gives the image's box the name, and its <img> the same alt text.
  const qr = page.locator('[role="img"][aria-label="QR code to pay ₹299 to E2E Payee"]');
  await expect(qr).toBeVisible();
  await expect
    .poll(() => qr.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth).catch(() => 0))
    .toBeGreaterThan(0); // the data URL drew under the app's CSP
  await expect(page.getByText(/^2\. Keep the note ".* Plus [A-Z2-9]{8}" so we can find your payment\.$/)).toBeVisible();
  await checkA11y(page, "plus-pay");

  const reference = page.getByLabel("UPI reference", { exact: true });
  await reference.fill("12345");
  await page.getByRole("button", { name: "Send reference" }).click();
  await expect(page.getByText("Enter the 12 digits of the reference.")).toBeVisible();
  await reference.fill("6123 4567 8901");
  await page.getByRole("button", { name: "Send reference" }).click();
  await expect(page.getByText(/^Thanks\. We're checking your payment \(reference 612345678901\)\./)).toBeVisible();
  await checkA11y(page, "plus-checking");

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
