/**
 * The waitlist's emailed links (stage 20d, D101-D102): confirm and leave take a press,
 * never just opening the page; axe on every screen. Joining moved off the landing page
 * when sign-up opened (D133), so this joins through the API, as the old form did, to
 * get a real email from the worker.
 */
import { expect, test } from "@playwright/test";

import { API_URL, CONSOLE_URL, E2E_PRIVACY_VERSION } from "../env";
import { checkA11y, waitlistLinkFromWorkerMail, watchErrors } from "./helpers";

test.use({ baseURL: CONSOLE_URL });

function unique(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test("confirm with a press, then leave", async ({ page, request }) => {
  const errors = await watchErrors(page);
  const email = unique("join");
  const joined = await request.post(`${API_URL}/v1/waitlist`, { data: { email, adult: true, privacy: E2E_PRIVACY_VERSION } });
  expect(joined.status()).toBe(202);

  // Opening the link changes nothing: mail scanners open links too.
  const confirm = await waitlistLinkFromWorkerMail(email, "confirm");
  await page.goto(confirm);
  await expect(page.getByRole("heading", { name: "Confirm your place", level: 1 })).toBeVisible();
  await page.reload();
  await checkA11y(page, "waitlist confirm");
  await page.getByRole("button", { name: "Confirm my place" }).click();
  await expect(page.getByRole("status")).toContainText("You're on the list");
  await expect(page.getByRole("button", { name: "Confirm my place" })).toHaveCount(0);

  // The same link again: already used.
  await page.goto(confirm);
  await page.getByRole("button", { name: "Confirm my place" }).click();
  await expect(page.getByRole("status")).toContainText("already been used");

  const leave = await waitlistLinkFromWorkerMail(email, "leave");
  await page.goto(leave);
  await checkA11y(page, "waitlist leave");
  await page.getByRole("button", { name: "Remove my address" }).click();
  await expect(page.getByRole("status")).toContainText("Your address is deleted");
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});

test("a link without its token says so and offers nothing to press", async ({ page }) => {
  for (const path of ["/waitlist/confirm", "/waitlist/leave?t=short"]) {
    const res = await page.goto(path);
    expect(res?.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByText("This link is incomplete")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});
