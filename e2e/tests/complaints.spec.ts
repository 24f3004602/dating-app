/**
 * The complaints page (stage 28d, D155): India's IT Rules (rule 3(2)) want the grievance
 * officer's name and contact and the ways to complain on a page the home page links to, in
 * either language. The officer is the website's OPERATOR_NAME; the limits are the rules' own.
 */
import { expect, test } from "@playwright/test";

import { CONSOLE_URL, E2E_CONTACT_EMAIL, E2E_OPERATOR_NAME } from "../env";
import { checkA11y, watchErrors } from "./helpers";

test("the home page links to the complaints page, which names the grievance officer (E2E-25)", async ({ page }) => {
  const errors = await watchErrors(page);
  // From the Hindi home page too: the link says the page is in English.
  await page.goto(`${CONSOLE_URL}/hi`);
  const hindi = page.getByRole("contentinfo").getByRole("link", { name: "शिकायतें और शिकायत अधिकारी" });
  await expect(hindi).toHaveAttribute("href", "/complaints");
  await expect(hindi).toHaveAttribute("hreflang", "en");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "एंड्रॉयड ऐप" })).toHaveAttribute("href", "/android");

  await page.goto(`${CONSOLE_URL}/`);
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "The Android app" })).toHaveAttribute("href", "/android");
  await footer.getByRole("link", { name: "Complaints and the grievance officer" }).click();
  await expect(page).toHaveURL(`${CONSOLE_URL}/complaints`);
  await expect(page.getByRole("heading", { name: "Complaints and the grievance officer", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/^Complaints · /);
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual([
    "The grievance officer",
    "Report it in the app",
    "Or write to us",
    "How fast we must act",
    "If you disagree",
    "Courts and government",
    "Your personal data",
  ]);
  // The officer by name, and a way to write to them.
  await expect(page.getByText(`Grievance officer: ${E2E_OPERATOR_NAME}`)).toBeVisible();
  await expect(page.getByRole("link", { name: E2E_CONTACT_EMAIL }).first()).toHaveAttribute("href", `mailto:${E2E_CONTACT_EMAIL}`);
  // The rules' limits (as amended on 10 February 2026) and the appeal.
  await expect(page.getByText("acknowledged within 24 hours, and resolved within 7 days")).toBeVisible();
  await expect(page.getByText(/resolved within 36 hours/)).toBeVisible();
  await expect(page.getByText(/within 2 hours of your complaint/)).toBeVisible();
  await expect(page.getByRole("link", { name: "gac.gov.in" })).toHaveAttribute("href", "https://gac.gov.in");
  await expect(page.getByText(/within 30 days of our reply/)).toBeVisible();
  // Every document's footer leads here too.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Complaints" })).toHaveAttribute("href", "/complaints");

  await checkA11y(page, "website complaints");
  await page.screenshot({ path: "test-results/complaints.png", fullPage: true }); // for review
  await page.setViewportSize({ width: 320, height: 700 }); // reflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});
