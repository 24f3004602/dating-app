/**
 * One language per page (stage 22a, D120; the owner's request): English at /, Hindi at
 * /hi, never one written beside the other. The sign band links each page to the other,
 * named in its own language; the Hindi page passes axe, reflows at 320 px, and its
 * waitlist form answers in Hindi through the real API.
 */
import { expect, test } from "@playwright/test";

import { CONSOLE_URL } from "../env";
import { checkA11y, watchErrors } from "./helpers";

test.use({ baseURL: CONSOLE_URL });

const DEVANAGARI = /[ऀ-ॿ]/;

test("English has no Hindi but the way to it; the Hindi page is all Hindi and its form answers in Hindi", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const toHindi = page.getByRole("link", { name: "हिन्दी" });
  await expect(toHindi).toHaveAttribute("lang", "hi");
  await expect(toHindi).toHaveAttribute("hreflang", "hi");
  // Nothing in Devanagari on the English page but the option's own name.
  const english = await page.evaluate(() => document.body.innerText);
  expect(english.replace("हिन्दी", "")).not.toMatch(DEVANAGARI);

  // By keyboard, the option goes to the Hindi page.
  await toHindi.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/hi$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { name: "कम, पर बेहतर परिचय", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/कम, पर बेहतर परिचय/);
  await expect(page.getByText("अभी शुरू नहीं हुआ")).toBeVisible();
  await expect(page.getByRole("heading", { name: "रोज़ दस लाइक, सबके लिए" })).toBeVisible();

  // The form in Hindi: an empty try names the field, a good one points to the inbox.
  const form = page.getByRole("region", { name: "अगला स्टेशन: दिल्ली एनसीआर" });
  const join = form.getByRole("button", { name: "वेटलिस्ट में शामिल हों" });
  await join.click();
  await expect(form.getByLabel("आपका ईमेल पता")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("कोई ईमेल पता लिखें")).toBeVisible();
  await form.getByLabel("आपका ईमेल पता").fill(`hindi-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await form.getByLabel("मेरी उम्र 18 साल या उससे ज़्यादा है").check();
  await join.click();
  await expect(form.getByRole("status")).toContainText("अपने इनबॉक्स में लिंक देखें");

  // The documents are in English, and the Hindi page's links to them say so.
  const notice = page.getByRole("link", { name: "गोपनीयता सूचना (अंग्रेज़ी में)" }).first();
  await expect(notice).toHaveAttribute("hreflang", "en");

  await checkA11y(page, "landing in Hindi");
  await page.screenshot({ path: "test-results/landing-hi.png", fullPage: true }); // for review
  await page.setViewportSize({ width: 320, height: 700 }); // reflow, with Hindi's longer words
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  // And back to English.
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});
