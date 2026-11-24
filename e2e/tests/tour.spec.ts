/**
 * E2E-19 (D136): the app tour in the web app, through the real expo-speech web module. The
 * browser's speech synthesis is a recorder here (CI's Chrome has no voices), with one Indian
 * English voice on the device. Someone new is offered the tour once; it walks the line, each
 * stop opening its place behind the card (which keyboard and screen readers can't reach while
 * it's up); a tap on a stop takes it there; reading aloud says each stop's own words, a
 * sentence at a time, in Indian English, and stays off once turned off; Escape closes it; You
 * has it any time; after a reload and a new sign-in on the same browser, it isn't offered again.
 */
import { expect, type Page, test } from "@playwright/test";

import { checkA11y, PASSWORD, signUp, watchErrors } from "./helpers";

type Utterance = { text: string; lang: string; voice: string | null } | "cancel";

async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __spoken: unknown[] }).__spoken = log;
    class Utterance {
      text: string;
      lang = "";
      voice: { voiceURI: string } | null = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: ((e: object) => void) | null = null;
      onend: ((e: object) => void) | null = null;
      onerror: ((e: object) => void) | null = null;
      onpause: ((e: object) => void) | null = null;
      onresume: ((e: object) => void) | null = null;
      onmark: ((e: object) => void) | null = null;
      onboundary: ((e: object) => void) | null = null;
      constructor(text?: string) {
        this.text = text ?? "";
      }
    }
    const voices = [{ voiceURI: "Test English (India)", name: "Test English (India)", lang: "en-IN", localService: true, default: true }];
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices: () => voices,
      speak(u: Utterance) {
        log.push({ text: u.text, lang: u.lang, voice: u.voice?.voiceURI ?? null });
        setTimeout(() => {
          u.onstart?.({});
          u.onend?.({});
        }, 0);
      },
      cancel() {
        log.push("cancel");
      },
      pause() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  });
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: Utterance[] }).__spoken.filter((u) => u !== "cancel"));

test("someone new takes the app tour, read aloud, along the line", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await watchErrors(page);
  await recordSpeech(page);
  const email = `e2e-tour-${Date.now()}@example.com`; // a labelled test account
  await signUp(page, email, { keepTourOffer: true });

  // The offer: once, never started unasked, nothing said yet.
  const tour = page.getByRole("dialog", { name: "App tour" });
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading", { name: /^Welcome to / })).toBeVisible();
  await expect(tour.getByRole("heading", { name: /^Welcome to / })).toBeFocused();
  await expect(tour.getByRole("switch", { name: "Read it aloud" })).toBeChecked();
  await checkA11y(page, "tour-offer");
  expect(await spoken(page)).toEqual([]);
  // The place behind the card can't be reached while it's up.
  await expect(page.locator("[inert]")).toHaveCount(1);
  await expect(page.locator("[inert]").getByRole("button", { name: "Create your profile", includeHidden: true })).toBeAttached();

  // Start: Today opens behind the card, and its words are read in Indian English, a sentence at a time.
  await tour.getByRole("button", { name: "Start the tour" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(tour.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(tour.getByText("1 of 7", { exact: true })).toBeVisible();
  // What's said is the card's own words: the title, then the text, nothing else.
  const todayWords = "Today. " + (await tour.getByText(/^Every day you get a short set of introductions/).innerText());
  await expect.poll(async () => (await spoken(page)).map((u) => (u as { text: string }).text).join(" ")).toBe(todayWords);
  const today = await spoken(page);
  expect(today.length).toBeGreaterThan(1); // a sentence at a time
  expect(today[0]).toEqual({ text: "Today.", lang: "en-IN", voice: "Test English (India)" });
  await checkA11y(page, "tour-today");

  // Next: Likes. Then a tap on the line's Matches stop takes the tour there.
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/likes$/);
  await expect(tour.getByRole("heading", { name: "Likes", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Matches" }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(tour.getByRole("heading", { name: "Matches", exact: true })).toBeVisible();
  await expect(tour.getByText("4 of 7", { exact: true })).toBeVisible();
  await expect.poll(async () => (await spoken(page)).some((u) => (u as { text: string }).text === "Matches.")).toBe(true);

  // Reading aloud off: remembered on this device, and the next stop is quiet.
  await tour.getByRole("switch", { name: "Read it aloud" }).click();
  await expect(tour.getByRole("switch", { name: "Read it aloud" })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("tour.voice"))).toBe("off");
  const before = (await spoken(page)).length;
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/profile$/);
  await page.waitForTimeout(300);
  expect((await spoken(page)).length).toBe(before);

  // Escape closes it; the place is in reach again.
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);

  // You has it any time: it starts at Today again.
  await page.getByRole("button", { name: "App tour" }).click();
  await expect(tour.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/discover$/);
  await tour.getByRole("button", { name: "Close the tour" }).click();
  await expect(tour).toHaveCount(0);

  // A reload keeps the web session (D152) and doesn't offer the tour again; nor does signing out
  // and in again on this browser.
  await page.reload();
  await expect(page.getByRole("tab", { name: "You" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(tour).toHaveCount(0);
  await page.getByRole("tab", { name: "You" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "I already have an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Let's set up your profile" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(tour).toHaveCount(0);

  expect(errors.server).toEqual([]);
  expect(errors.console).toEqual([]);
});
