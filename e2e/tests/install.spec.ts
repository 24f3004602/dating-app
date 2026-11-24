/**
 * The web app can be added to a phone's home screen (stage 28b, D153): Chrome itself reports
 * no installability error for the real build, and the manifest and icons load from it.
 */
import { expect, test } from "@playwright/test";

import { CONSOLE_URL, WEB_URL } from "../env";
import { checkA11y, watchErrors } from "./helpers";

test("the website's Android page: the download, how to install it, and the web app instead (E2E-24)", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto(`${CONSOLE_URL}/privacy`); // linked from every document's footer
  await page.getByRole("contentinfo").getByRole("link", { name: "Android app" }).click();
  await expect(page).toHaveURL(`${CONSOLE_URL}/android`);
  await expect(page.getByRole("heading", { name: /for Android$/, level: 1 })).toBeVisible();
  const download = page.getByRole("link", { name: "Download the app" });
  await expect(download).toHaveAttribute("href", /\/releases\/latest\/download\/kinaara\.apk$/);
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual([
    "Installing it",
    "Only from here",
    "Updates",
    "Nothing to install",
    "Removing it",
  ]);
  await expect(page.getByRole("link", { name: "127.0.0.1:8772" })).toHaveAttribute("href", `${WEB_URL}/welcome`);
  await checkA11y(page, "website android");
  await page.setViewportSize({ width: 320, height: 700 }); // the certificate wraps, nothing sticks out
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});

test("Chrome finds the web app installable (E2E-23)", async ({ page, context }) => {
  const errors = await watchErrors(page);
  await page.goto(`${WEB_URL}/welcome`);
  await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();

  const manifest = await page.request.get(`${WEB_URL}/manifest.json`);
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  for (const icon of body.icons as { src: string }[]) {
    const image = await page.request.get(`${WEB_URL}${icon.src}`);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"], icon.src).toContain("image/png");
  }

  // Chrome's own verdict, as its install prompt uses it. Playwright's browser contexts are
  // incognito-like, where Chrome never offers an install ("in-incognito"): that one is the test
  // harness, not the app (checked 2026-11-24: the only error, with the manifest error-free).
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors.filter((e) => e.errorId !== "in-incognito")).toEqual([]);
  const { url, errors: manifestErrors } = await cdp.send("Page.getAppManifest");
  expect(url).toBe(`${WEB_URL}/manifest.json`);
  expect(manifestErrors).toEqual([]);

  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});
