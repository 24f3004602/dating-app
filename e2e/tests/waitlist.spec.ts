/**
 * The waitlist on the landing page (stage 20d, D101-D102): join through the form, the
 * real API and worker; confirm and leave from the emailed links, which take a press,
 * never just opening the page. Errors are tied to their fields; axe on every screen.
 */
import { expect, type Page, test } from "@playwright/test";

import { CONSOLE_URL } from "../env";
import { checkA11y, waitlistLinkFromWorkerMail, watchErrors } from "./helpers";

test.use({ baseURL: CONSOLE_URL });

function unique(name: string): string {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function join(page: Page, email: string) {
  const form = page.getByRole("region", { name: "Next stop: Delhi NCR" });
  await form.getByLabel("Your email address").fill(email);
  await form.getByLabel("I'm 18 or over").check();
  await form.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(form.getByRole("status")).toContainText("Check your inbox");
}

test("join, confirm with a press, then leave", async ({ page }) => {
  const errors = await watchErrors(page);
  const email = unique("join");
  await page.goto("/");
  await join(page, email);

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

test("the form names what's wrong, next to the field", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("region", { name: "Next stop: Delhi NCR" });
  const email = form.getByLabel("Your email address");
  await email.fill("not-an-address");
  await form.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/Enter an email address/);

  await email.fill(unique("adult"));
  await form.getByRole("button", { name: "Join the waitlist" }).click();
  const adult = form.getByLabel("I'm 18 or over");
  await expect(adult).toHaveAttribute("aria-invalid", "true");
  await expect(adult).toHaveAccessibleDescription(/18 or over/);
  await expect(email).toHaveValue(/^adult-/); // what they typed is kept
  await checkA11y(page, "waitlist errors");
});

test("a link without its token says so and offers nothing to press", async ({ page }) => {
  for (const path of ["/waitlist/confirm", "/waitlist/leave?t=short"]) {
    const res = await page.goto(path);
    expect(res?.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByText("This link is incomplete")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});
