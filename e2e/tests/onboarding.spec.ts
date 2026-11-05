/**
 * The first vertical slice, end to end: Expo web build -> real API -> real
 * PostgreSQL, Redis and worker. Sign up (age gate, consents), read the code
 * from the worker's development mail, verify, create a profile, upload a
 * GPS-tagged photo, set privacy, sign out.
 *
 * Every screen gets an axe scan (serious and critical WCAG A/AA issues fail
 * the test); any console error or 5xx response fails it too.
 */
import { expect, test } from "@playwright/test";

import { PHOTO } from "../env";
import { checkA11y, codeFromWorkerMail, PASSWORD } from "./helpers";

test("sign up, verify, create a profile, add a photo, set privacy, sign out", async ({ page }) => {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (m) => {
    // Chrome logs expected 4xx answers (e.g. "no profile yet") as resource errors; those are checked below.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
  });

  const email = `e2e-${Date.now()}@example.com`; // labelled test account

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fewer, better introductions" })).toBeVisible();
  await checkA11y(page, "welcome");
  await page.getByRole("button", { name: "Create an account" }).click();

  // Sign-up: an under-18 date is refused on the device before anything is sent.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Day", { exact: true }).fill("1");
  await page.getByLabel("Month", { exact: true }).fill("1");
  const thisYear = new Date().getFullYear();
  await page.getByLabel("Year", { exact: true }).fill(String(thisYear - 17));
  await page.getByRole("checkbox", { name: "I accept the terms of use", exact: true }).click();
  await page.getByRole("checkbox", { name: "I have read the privacy notice", exact: true }).click();
  await checkA11y(page, "sign-up");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("You must be 18 or older to join.")).toBeVisible();
  await page.getByLabel("Year", { exact: true }).fill(String(thisYear - 27));
  await page.getByRole("button", { name: "Create account" }).click();

  // Verify with the code the worker mailed (development console backend).
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await checkA11y(page, "verify");
  const code = await codeFromWorkerMail(email);
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();

  // No profile yet: the empty state, with honest labels.
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();
  await expect(page.getByText("Age declared · Email verified · Identity not checked")).toBeVisible();
  await checkA11y(page, "profile-empty");
  await page.getByRole("button", { name: "Create your profile" }).click();

  // Create the profile.
  await page.getByLabel("First name", { exact: true }).fill("Asha");
  await page.getByRole("radio", { name: "Woman", exact: true }).click();
  await page.getByRole("checkbox", { name: "Man", exact: true }).click();
  await page.getByRole("radio", { name: "A long-term relationship", exact: true }).click();
  await page.getByRole("radio", { name: "Saket, Delhi", exact: true }).click();
  await page.getByRole("radio", { name: "The festival I look forward to all year", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("Holi, for the colours.");
  await checkA11y(page, "edit-profile");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Asha, 27" })).toBeVisible();
  await expect(page.getByText(/Not visible to others yet/)).toBeVisible();
  await checkA11y(page, "profile");

  // Photos: upload through the web file picker.
  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByText("No photos yet. Add 2 to 6 clear photos of yourself.")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add a photo" }).click();
  await (await chooser).setFiles(PHOTO);
  // React Native Web renders a role="img" element around a hidden <img> with the same
  // name (children of role=img are presentational, so screen readers hear it once).
  const thumb = page.locator('[role="img"][aria-label="Your photo 1 of 1"]');
  await expect(thumb).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible(); // review is off for this run (no queue until stage 11)
  await checkA11y(page, "photos");

  // The stored image came back through a signed URL, stripped of metadata.
  const src = await thumb.locator("img").first().getAttribute("src");
  expect(src).toContain("/v1/media/blob/");
  const image = await page.request.get(src!);
  expect(image.status()).toBe(200);
  expect((await image.body()).includes(Buffer.from("SecretPhone"))).toBe(false);

  // A second photo makes the profile ready for introductions.
  const second = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add a photo" }).click();
  await (await second).setFiles(PHOTO);
  await expect(page.locator('[role="img"][aria-label="Your photo 2 of 2"]')).toBeVisible();

  // Today's introductions: labelled fixtures, distance as a bucket only.
  await page.goBack();
  await expect(page.getByText("Ready to be introduced")).toBeVisible();
  await page.getByRole("button", { name: "Today's introductions" }).click();
  await expect(page.getByRole("heading", { name: "Today's introductions" })).toBeVisible();
  const cards = page.getByRole("button", { name: /^View profile: Fixture / });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThanOrEqual(15);
  const firstLabel = (await cards.first().getAttribute("aria-label")) ?? "";
  expect(firstLabel).toMatch(/(under 5 km|5 to 15 km|15 to 50 km|more than 50 km) away\.$/);
  await checkA11y(page, "discover");
  await cards.first().click();
  await expect(page.getByText("Development fixture: not a real person.")).toBeVisible();
  await expect(page.locator('[role="img"][aria-label^="Photo 1 of 2 of Fixture"]')).toBeVisible();
  await checkA11y(page, "person");

  // Like them, with a note (fixtures never like back, so no match here).
  await page.getByLabel("Add a note (optional)", { exact: true }).fill("Holi is my favourite too.");
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(page.getByText(/^Liked\. \d+ likes left today\.$/)).toBeVisible();

  // Matches and likes: honest empty states.
  await page.goBack();
  await page.goBack();
  await page.getByRole("button", { name: "Matches", exact: true }).click();
  await expect(page.getByText("No matches yet. When you both like each other, they appear here.")).toBeVisible();
  await checkA11y(page, "matches");
  await page.goBack();
  await page.getByRole("button", { name: "Likes", exact: true }).click();
  await expect(page.getByText("No new likes yet. Likes appear here until you decide.")).toBeVisible();
  await checkA11y(page, "likes");

  // Preferences apply from the next set.
  await page.goBack();
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("radio", { name: "Within 15 km", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Your next daily set will use these preferences.")).toBeVisible();
  await checkA11y(page, "preferences");

  // Privacy.
  await page.goBack();
  await page.getByRole("button", { name: "Privacy" }).click();
  await page.getByRole("radio", { name: "Only people I have liked", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Only people I have liked", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Pause new introductions", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Pause new introductions", exact: true })).toBeChecked();
  await checkA11y(page, "privacy");

  // Notifications (stage 16): categories save; push itself is for the phone app.
  await page.goBack();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByText("Notifications never show names or message text: only that something happened.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Someone liked me", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Someone liked me", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Turn on notifications" }).click();
  await expect(page.getByText("Notifications work in the phone app, not in a browser.")).toBeVisible();
  await checkA11y(page, "notifications");

  // Sign out: back to the welcome screen, and the session no longer works.
  await page.goBack();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fewer, better introductions" })).toBeVisible();

  expect(serverErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
