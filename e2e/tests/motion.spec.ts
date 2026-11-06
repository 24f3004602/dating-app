/**
 * Motion (stage 19, D098): it serves the page, ends at rest, passes axe, never
 * overflows at narrow, tablet or wide widths, and none of it happens for visitors
 * who ask for reduced motion. The rest of the suite runs with reduced motion
 * (playwright.config.ts), so its checks never race an animation.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { CONSOLE_URL, WEB_URL } from "../env";
import { checkA11y, watchErrors } from "./helpers";

/** CSS animations currently running on elements matching a selector. */
function running(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) =>
      document.getAnimations().filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return a.playState === "running" && target instanceof Element && target.matches(sel);
      }).length,
    selector,
  );
}

/** The lowest opacity on the way up from an element: 1 means it's fully shown. */
function shown(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    let lowest = 1;
    for (let n: Element | null = el; n; n = n.parentElement) lowest = Math.min(lowest, Number(getComputedStyle(n).opacity));
    return lowest;
  });
}

async function fitsEveryWidth(page: Page) {
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `no sideways scroll at ${width}px`).toBeLessThanOrEqual(width);
  }
}

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("landing: the shoreline sways and can be paused, the words and cards rise in, axe once settled", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${CONSOLE_URL}/`);
    await expect(page.getByRole("heading", { name: "Fewer, better introductions", level: 1 })).toBeVisible();
    await expect.poll(() => running(page, ".wave")).toBe(3);
    expect(await running(page, ".dusk")).toBe(1);

    // WCAG 2.2.2: the moving background can be paused, and started again.
    const toggle = page.getByRole("button", { name: "Pause animation" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => running(page, ".wave, .dusk")).toBe(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => running(page, ".wave")).toBe(3);

    // The words end fully shown; so do the feature cards once scrolled to.
    await expect.poll(() => shown(page.locator(".hero-inner > p").first())).toBe(1);
    const last = page.locator(".features li").last();
    await last.scrollIntoViewIfNeeded();
    await expect.poll(() => shown(last)).toBeGreaterThan(0.99);

    // No video here: none is configured (and the site is behind Cloudflare's free plan).
    await expect(page.locator("video")).toHaveCount(0);
    await page.screenshot({ path: "test-results/landing-motion.png", fullPage: true }); // for review
    await checkA11y(page, "landing (motion)");
    await fitsEveryWidth(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/landing-motion-wide.png" }); // 1280 px, for review
    expect(errors.console).toEqual([]);
  });

  test("app welcome: the rings meet, then the words and buttons rise into place", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${WEB_URL}/welcome`);
    await expect(page.locator('[data-rings="meet"]')).toHaveAttribute("data-motion", "animated");
    const title = page.getByRole("heading", { name: "Fewer, better introductions" });
    await expect.poll(() => shown(title)).toBe(1);
    await expect.poll(() => shown(page.getByRole("button", { name: "Create an account" }))).toBe(1);
    await page.screenshot({ path: "test-results/welcome-motion.png" }); // for review
    await checkA11y(page, "welcome (motion)");
    await fitsEveryWidth(page);
    expect(errors.console).toEqual([]);
  });

  test("design gallery: every motion pattern plays and ends at rest", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${WEB_URL}/design`);
    for (const mode of ["meet", "breathe", "join"]) {
      await expect(page.locator(`[data-rings="${mode}"]`)).toHaveAttribute("data-motion", "animated");
    }
    const third = page.getByRole("button", { name: "Sample card: Third" });
    await third.scrollIntoViewIfNeeded();
    await expect.poll(() => shown(third)).toBe(1);
    await page.getByRole("button", { name: "Replay" }).click();
    await expect.poll(() => shown(page.getByRole("button", { name: "Sample card: Third" }))).toBe(1);
    await checkA11y(page, "design gallery (motion)");
    expect(errors.console).toEqual([]);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves: no animations on the landing page, everything at rest in the app", async ({ page }) => {
    await page.goto(`${CONSOLE_URL}/`);
    await expect(page.getByRole("heading", { name: "Fewer, better introductions", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    await expect(page.getByRole("button", { name: "Pause animation" })).toBeHidden(); // nothing to pause

    await page.goto(`${WEB_URL}/welcome`);
    await expect(page.locator('[data-rings="meet"]')).toHaveAttribute("data-motion", "still");
    await expect(page.locator('[data-motion="animated"]')).toHaveCount(0);
    expect(await shown(page.getByRole("heading", { name: "Fewer, better introductions" }))).toBe(1);
  });
});
