/**
 * One language per page (stage 22a, D120; the owner's request): English at /, Hindi at
 * /hi, never one written beside the other. The sign band links each page to the other,
 * named in its own language; the Hindi page passes axe, reflows at 320 px, and its
 * buttons into the app (D133) are in Hindi and say the app is in English.
 */
import { expect, test } from "@playwright/test";

import { CONSOLE_URL } from "../env";
import { checkA11y, watchErrors } from "./helpers";

test.use({ baseURL: CONSOLE_URL });

const DEVANAGARI = /[ऀ-ॿ]/;

test("English has no Hindi but the way to it; the Hindi page is all Hindi, its buttons too", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "रोज़ दस लाइक, सबके लिए" })).toBeVisible();

  // The way into the app, in Hindi; the app is in English, and the links and the note say so.
  const panel = page.getByRole("region", { name: "अगला स्टेशन: आपका शहर" });
  const create = panel.getByRole("link", { name: "अकाउंट बनाएँ" });
  await expect(create).toHaveAttribute("hreflang", "en");
  await expect(create).toHaveAttribute("href", /\/sign-up$/);
  await expect(panel.getByRole("link", { name: "साइन इन करें" })).toHaveAttribute("href", /\/sign-in$/);
  await expect(panel.getByText(/ऐप अभी अंग्रेज़ी में है/)).toBeVisible();

  // The documents are in English, and the Hindi page's links to them say so.
  const notice = page.getByRole("link", { name: "गोपनीयता सूचना" }).first();
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
