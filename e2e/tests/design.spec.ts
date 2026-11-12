/**
 * The design system (stage 13, D088): the gallery of every component and
 * state passes axe, keyboard focus shows the ring, a focused field shows its
 * border, and a screenshot is kept for review (test-results/design-gallery.png).
 */
import { expect, test } from "@playwright/test";

import { checkA11y, watchErrors } from "./helpers";

test("the design gallery: axe, keyboard focus, screenshot", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();
  await checkA11y(page, "design-gallery");

  // Real keyboard navigation reaches the first button, which shows the focus ring.
  const primary = page.getByRole("button", { name: "Primary", exact: true });
  for (let i = 0; i < 40 && !(await primary.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS("outline-style", "solid");
  await expect(primary).toHaveCSS("outline-width", "2px");
  await expect(primary).toHaveCSS("outline-color", "rgb(36, 83, 196)"); // color.focus
  await page.keyboard.press("Tab");
  await expect(primary).toHaveCSS("outline-style", "none"); // only while focused

  // A focused field: a 2-point accent border instead of the browser's outline.
  const field = page.getByLabel("Field", { exact: true });
  await field.focus();
  await expect(field).toHaveCSS("border-top-width", "2px");
  await expect(field).toHaveCSS("border-top-color", "rgb(14, 102, 112)"); // color.accent
  await expect(field).toHaveCSS("outline-style", "none"); // not Chrome's own ring on top

  // Disabled and busy buttons say so.
  await expect(page.getByRole("button", { name: "Primary, disabled" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Primary, busy" })).toHaveAttribute("aria-busy", "true");

  // Reflow (WCAG 1.4.10): at 320 CSS pixels wide, nothing sticks out sideways.
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > 320.5)
      .map((el) => el.getAttribute("aria-label") ?? el.textContent?.slice(0, 40) ?? el.tagName),
  );
  expect(overflow).toEqual([]);

  await page.setViewportSize({ width: 390, height: 4200 }); // the page scrolls inside the app: show it all
  await page.screenshot({ path: "test-results/design-gallery.png", fullPage: true });

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
