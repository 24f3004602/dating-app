/**
 * The web app can be added to a phone's home screen (stage 28b, D153): Chrome itself reports
 * no installability error for the real build, and the manifest and icons load from it.
 */
import { expect, test } from "@playwright/test";

import { WEB_URL } from "../env";
import { watchErrors } from "./helpers";

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
