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

/** Whether a video element is playing (not paused, and its clock has moved). */
function playing(video: Locator): Promise<boolean> {
  return video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0);
}

/** Collects the page's layout shifts from the start (Core Web Vitals CLS), in window.__cls. */
async function measureLayoutShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
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

  test("landing: the line draws as you travel down it, the loop at its end can be paused, axe once settled", async ({ page }) => {
    const errors = await watchErrors(page);
    await measureLayoutShift(page);
    await page.goto(`${CONSOLE_URL}/`);
    await expect(page.getByRole("heading", { name: "Fewer, better introductions", level: 1 })).toBeVisible();

    // The signature (D101): each station's rail draws as it scrolls into view, driven
    // by scrolling alone (no script). Before the visitor gets there it isn't drawn.
    const end = page.locator("#destination");
    const drawn = () => end.evaluate((el) => new DOMMatrix(getComputedStyle(el, "::before").transform).d);
    expect(await drawn()).toBeLessThan(0.5);
    await end.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect.poll(drawn).toBeGreaterThan(0.99);
    // Every word was on the page all along: only the rails move.
    expect(await shown(end.getByRole("heading", { name: "Then, a conversation" }))).toBe(1);

    // The candlelight loop at the end of the line (D099): the still first, then the
    // loop once the browser is idle; a 390 px screen gets the light files.
    await expect(page.locator(".hero-story img")).toHaveAttribute("alt", "");
    const video = page.locator(".hero-story video");
    await expect(video).toHaveCount(1);
    expect(await video.evaluate((v: HTMLVideoElement) => [v.muted, v.loop, v.autoplay, v.playsInline])).toEqual([true, true, true, true]);
    expect(await video.locator("source").evaluateAll((list) => list.map((s) => [s.getAttribute("type"), s.getAttribute("src")]))).toEqual([
      ["video/webm", "/media/candles-v1-480.webm"],
      ["video/mp4", "/media/candles-v1-480.mp4"],
    ]);
    await expect.poll(() => playing(video)).toBe(true);
    // Nothing moved while the fonts, the still and then the video arrived.
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.05);

    // WCAG 2.2.2: the loop can be paused, and started again.
    const toggle = page.getByRole("button", { name: "Pause video" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => playing(video)).toBe(true);

    await page.screenshot({ path: "test-results/landing-motion.png", fullPage: true }); // for review
    await checkA11y(page, "landing (motion)");
    await fitsEveryWidth(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/landing-motion-wide.png" }); // 1280 px, for review
    expect(errors.console).toEqual([]);
  });

  test("landing: the route map rises into 3D, the marigold ring hooks through the teal one and comes to rest", async ({ page }) => {
    // Stage 21a (D119): loaded once the page is idle, shown when its first frames match
    // the flat map, at rest within seconds; the flat SVG stays the accessible picture.
    const errors = await watchErrors(page);
    await measureLayoutShift(page);
    await page.goto(`${CONSOLE_URL}/`);
    const map = page.locator("[data-scene]:visible");
    await expect(map).toHaveCount(1);
    const picture = page.getByRole("img", { name: /^A route map: your line and someone else's line meet/ });
    await expect(picture).toBeVisible();
    await expect(map).toHaveAttribute("data-scene", "3d", { timeout: 20_000 });
    // The scene is decoration: one canvas, hidden from assistive technology.
    await expect(map.locator('[aria-hidden="true"] canvas')).toHaveCount(1);
    await expect(map).toHaveAttribute("data-settled", "true", { timeout: 15_000 });
    // The words and the picture's name are still the SVG's, on top of the scene.
    await expect(picture).toBeVisible();
    await expect(map.getByText("Fit both ways")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.05);
    await page.screenshot({ path: "test-results/landing-3d.png" }); // for review
    await checkA11y(page, "landing (3D map)");

    // Wide: the tall map takes over, its scene already at rest (no second performance).
    await page.setViewportSize({ width: 1280, height: 900 });
    const wide = page.locator("[data-scene]:visible");
    await expect(wide).toHaveAttribute("data-scene", "3d", { timeout: 20_000 });
    await expect(wide).toHaveAttribute("data-settled", "true");
    await expect(wide.locator('[aria-hidden="true"] canvas')).toHaveCount(1);
    await page.screenshot({ path: "test-results/landing-3d-wide.png" }); // for review
    await fitsEveryWidth(page);
    // No console error and no CSP violation (the physics engine is WebAssembly: 'wasm-unsafe-eval').
    expect(errors.console).toEqual([]);
    expect(errors.server).toEqual([]);
  });

  test("app welcome: the candlelight loop under the overlay, the rings meet, the words rise in", async ({ page }) => {
    const errors = await watchErrors(page);
    await page.goto(`${WEB_URL}/welcome`);
    await expect(page.locator('[data-rings="meet"]')).toHaveAttribute("data-motion", "animated");
    const title = page.getByRole("heading", { name: "Fewer, better introductions" });
    await expect.poll(() => shown(title)).toBe(1);
    const signUp = page.getByRole("button", { name: "Create an account" });
    await expect.poll(() => shown(signUp)).toBe(1);

    // The loop comes from the website (another origin, allowed by the app's CSP).
    await expect(page.locator('[data-welcome-video="playing"]')).toBeAttached();
    const video = page.locator('[data-welcome-video] video');
    expect(await video.locator("source").first().getAttribute("src")).toBe(`${CONSOLE_URL}/media/candles-v1-480.webm`);
    await expect.poll(() => playing(video)).toBe(true);
    // Light words on the dark overlay, and a marigold focus ring there (tokens: overlay-floor pairs).
    expect(await title.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    await signUp.focus();
    expect(await signUp.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor])).toEqual([
      "solid",
      "rgb(245, 181, 68)",
    ]);
    // WCAG 2.2.2: the video can be paused.
    const pause = page.getByRole("button", { name: "Pause video" });
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await pause.click();
    await expect.poll(() => playing(video)).toBe(true);
    // A square sign plate, and the world's ring on keyboard focus (D117): marigold inside graphite.
    await expect(pause).toHaveCSS("border-top-left-radius", "0px");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // the clicks focused it by mouse
    for (let i = 0; i < 20 && !(await pause.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(pause).toBeFocused();
    await expect(pause).toHaveCSS("outline-width", "3px");
    await expect(pause).toHaveCSS("outline-color", "rgb(245, 181, 68)");
    await expect(pause).toHaveCSS("box-shadow", "rgb(28, 27, 25) 0px 0px 0px 6px");
    await page.screenshot({ path: "test-results/welcome-motion.png" }); // for review
    await checkA11y(page, "welcome (motion)");
    await fitsEveryWidth(page);
    expect(errors.console).toEqual([]);
  });

  test("design gallery: every motion pattern plays and ends at rest", async ({ page }) => {
    const errors = await watchErrors(page);
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
    await expect(page.getByRole("button", { name: "Pause video" })).toBeHidden(); // nothing to pause
    // The line is simply drawn: no scroll-driven rails either.
    expect(await page.locator("#destination").evaluate((el) => new DOMMatrix(getComputedStyle(el, "::before").transform).d)).toBe(1);
    // The candlelight still, never the video.
    await expect(page.locator(".hero-story img")).toBeVisible();
    await page.waitForTimeout(2500); // longer than the idle wait before a video would start
    await expect(page.locator("video")).toHaveCount(0);
    // The route map stays flat: no 3D scene is even loaded (stage 21a, D119).
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-scene]:visible")).toHaveAttribute("data-scene", "flat");

    await page.goto(`${WEB_URL}/welcome`);
    await expect(page.locator('[data-rings="meet"]')).toHaveAttribute("data-motion", "still");
    await expect(page.locator('[data-motion="animated"]')).toHaveCount(0);
    expect(await shown(page.getByRole("heading", { name: "Fewer, better introductions" }))).toBe(1);
    await expect(page.locator('[data-welcome-video="still"] img')).toBeAttached();
    await page.waitForTimeout(2500);
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause video" })).toHaveCount(0);
  });
});
