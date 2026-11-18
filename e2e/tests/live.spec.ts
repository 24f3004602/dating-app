/**
 * E2E-16 (stage 23, D123): Live, random one-to-one video calls, in two real browsers with
 * Chrome's fake camera. Asha and Rohan accept the rules and start; the one who waited makes
 * the offer, the other answers, and WebRTC connects them (no relay in the e2e run; on a
 * server calls go only through one). Their video stays hidden until Asha chooses to see it,
 * and the free minute counts down. Asha ends the call; they like each other: a match. Then
 * Vikram's call with Asha ends in a report, which pauses Live for him until staff decide.
 */
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";

import { WEB_URL } from "../env";
import { checkA11y, readyProfile, signUp, watchErrors } from "./helpers";

// Chrome's own test camera and microphone, granted without a prompt; sound may autoplay.
const FAKE_MEDIA = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"];

async function person(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    permissions: ["camera", "microphone"],
  });
  return context.newPage();
}

async function openLive(page: Page) {
  await page.getByRole("tab", { name: "Live" }).click();
  await expect(page.getByRole("heading", { name: "Live" })).toBeVisible();
}

/** The video element showing someone, playing frames. */
async function playing(page: Page, label: string) {
  await expect
    .poll(() => page.locator(`video[aria-label="${label}"]`).evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
}

test("two people meet on Live, like each other, and a report pauses Live for the one reported", async () => {
  test.setTimeout(240_000);
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: FAKE_MEDIA });
  try {
    const stamp = Date.now();
    const asha = await person(browser);
    const rohan = await person(browser);
    const errors = await Promise.all([watchErrors(asha), watchErrors(rohan)]);

    await signUp(asha, `e2e-asha-${stamp}@example.com`); // labelled test accounts
    await readyProfile(asha, { name: "Asha", gender: "Woman", seeking: "Man" });
    await signUp(rohan, `e2e-rohan-${stamp}@example.com`);
    await readyProfile(rohan, { name: "Rohan", gender: "Man", seeking: "Woman" });

    // The rules first, then Start.
    for (const page of [rohan, asha]) {
      await openLive(page);
      await expect(page.getByRole("heading", { name: "Before your first call" })).toBeVisible();
      await expect(page.getByText(/Their video stays hidden until you choose to show it\./)).toBeVisible();
      await page.getByRole("button", { name: "I agree" }).click();
      await expect(page.getByText("5 of 5 free calls left, up to a minute each.")).toBeVisible();
    }
    await checkA11y(asha, "live lobby");

    await rohan.getByRole("button", { name: "Start", exact: true }).click();
    await expect(rohan.getByText("Looking for someone…")).toBeVisible();
    await playing(rohan, "Your camera");
    await asha.getByRole("button", { name: "Start", exact: true }).click();

    // Paired and connected: names on plates, their video covered, the minute running.
    await expect(asha.getByText("Rohan, 27")).toBeVisible({ timeout: 30_000 });
    await expect(rohan.getByText("Asha, 27")).toBeVisible({ timeout: 30_000 });
    await expect(asha.getByText("Rohan's video is hidden.")).toBeVisible();
    await expect(asha.getByText(/^0:[0-5]\d left$|^1:00 left$/)).toBeVisible({ timeout: 30_000 });
    await expect(rohan.getByText(/^0:[0-5]\d left$|^1:00 left$/)).toBeVisible({ timeout: 30_000 });
    await checkA11y(asha, "live call");
    await asha.getByRole("button", { name: "Show video" }).click();
    await expect(asha.getByText("Rohan's video is hidden.")).toHaveCount(0);
    await playing(asha, "Rohan's video"); // his camera's frames reach her over WebRTC
    await playing(rohan, "Asha's video");

    // Asha ends it; Rohan's call ends too. They like each other: a match.
    await asha.getByRole("button", { name: "End", exact: true }).click();
    await expect(asha.getByText("Your call with Rohan has ended.")).toBeVisible();
    await expect(rohan.getByText("Your call with Asha has ended.")).toBeVisible({ timeout: 15_000 });
    await asha.getByRole("button", { name: "Like Rohan" }).click();
    await expect(asha.getByText("You liked Rohan. If they like you too, it's a match.")).toBeVisible();
    await rohan.getByRole("button", { name: "Like Asha" }).click();
    await expect(rohan.getByText("It's a match with Asha! Say hello in Matches.")).toBeVisible();
    await checkA11y(rohan, "live after a call");
    await rohan.getByRole("button", { name: "Done" }).click();
    await expect(rohan.getByText("4 of 5 free calls left, up to a minute each.")).toBeVisible();
    await rohan.getByRole("tab", { name: "Matches" }).click();
    await expect(rohan.getByRole("button", { name: /^Chat with Asha, 27/ })).toBeVisible();

    // Asha moves on; Vikram is next. She reports him: the call ends at once.
    const vikram = await person(browser);
    errors.push(await watchErrors(vikram));
    await signUp(vikram, `e2e-vikram-${stamp}@example.com`);
    await readyProfile(vikram, { name: "Vikram", gender: "Man", seeking: "Woman" });
    await asha.getByRole("button", { name: "Next person" }).click();
    await expect(asha.getByText("Looking for someone…")).toBeVisible();
    await openLive(vikram);
    await vikram.getByRole("button", { name: "I agree" }).click();
    await vikram.getByRole("button", { name: "Start", exact: true }).click();
    await expect(asha.getByText("Vikram, 27")).toBeVisible({ timeout: 30_000 });
    await asha.getByRole("button", { name: "Report Vikram" }).click();
    await expect(asha.getByRole("heading", { name: "Report Vikram" })).toBeVisible();
    await expect(asha.getByText("About: your Live call with Vikram. The call has ended.")).toBeVisible();
    await asha.getByRole("radio", { name: "Sexual or explicit content", exact: true }).click();
    await expect(asha.getByRole("checkbox", { name: "Also block Vikram", exact: true })).toBeChecked();
    await asha.getByRole("button", { name: "Send report" }).click();
    await expect(asha.getByText(/^Thanks for telling us\./)).toBeVisible();

    await expect(vikram.getByText(/has ended\.$/)).toBeVisible({ timeout: 15_000 });
    await vikram.getByRole("button", { name: "Next person" }).click();
    await expect(vikram.getByText("Live is paused for you while we review a report. We'll be in touch.")).toBeVisible({
      timeout: 15_000,
    });

    for (const found of errors) {
      expect(found.server).toEqual([]);
      expect(found.console).toEqual([]);
    }
  } finally {
    await browser.close();
  }
});
