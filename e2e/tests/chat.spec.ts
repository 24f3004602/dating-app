/**
 * Two real people, two browsers: both sign up, Meera is introduced to Kabir
 * and likes him, he likes her back, and they chat. Every update after the
 * first page load arrives through the realtime connection: neither page is
 * reloaded. Also covers the hurtful-word prompt and the money safety tip,
 * with axe on the chat and the matches list.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

import { checkA11y, readyProfile, signUp, watchErrors } from "./helpers";

/** A message in the open chat (the matches list underneath shows previews too). */
function message(page: Page, text: string) {
  return page.getByRole("listitem").filter({ hasText: text });
}

async function person(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test("two people match and chat, live", async ({ browser }) => {
  const stamp = Date.now();
  const kabir = await person(browser);
  const meera = await person(browser);
  const errors = [watchErrors(kabir), watchErrors(meera)];

  await signUp(kabir, `e2e-kabir-${stamp}@example.com`); // labelled test accounts
  await readyProfile(kabir, { name: "Kabir", gender: "Man", seeking: "Woman" });
  await signUp(meera, `e2e-meera-${stamp}@example.com`);
  await readyProfile(meera, { name: "Meera", gender: "Woman", seeking: "Man" });

  // Meera is introduced to Kabir and likes him.
  await meera.getByRole("tab", { name: "Today" }).click(); // the bottom bar (stage 20e)
  await meera.getByRole("button", { name: /^View profile: Kabir, 27./ }).click();
  await meera.getByRole("button", { name: "Like", exact: true }).click();
  await expect(meera.getByText(/^Liked\. \d+ likes left today\.$/)).toBeVisible();

  // Kabir finds her in his likes and likes back: a match.
  await kabir.getByRole("tab", { name: "Likes" }).click();
  await kabir.getByRole("button", { name: "View profile: Meera, 27" }).click();
  await kabir.getByRole("button", { name: "Like", exact: true }).click();
  await expect(kabir.getByText("It's a match! You both said yes.")).toBeVisible();
  await kabir.getByRole("button", { name: "See my matches" }).click();
  const meeraRow = kabir.getByRole("button", { name: /^Chat with Meera, 27/ });
  await expect(meeraRow).toBeVisible();

  // Meera opens the chat: an empty conversation that says how messages are stored.
  await meera.goBack(); // the person, back to the bottom bar
  await meera.getByRole("tab", { name: "Matches" }).click();
  await meera.getByRole("button", { name: /^Chat with Kabir, 27/ }).click();
  await expect(meera.getByText(/not end-to-end encrypted/)).toBeVisible();
  await meera.getByLabel("Message", { exact: true }).fill("Hi Kabir! Any Holi plans?");
  await meera.getByRole("button", { name: "Send", exact: true }).click();
  await expect(message(meera, "Hi Kabir! Any Holi plans?")).toBeVisible();
  await checkA11y(meera, "chat");

  // Kabir's matches list updates by itself: the preview, unread and his turn.
  await expect(kabir.getByRole("button", { name: "Chat with Meera, 27. 1 new. Your turn" })).toBeVisible();
  await expect(kabir.getByText("Hi Kabir! Any Holi plans?")).toBeVisible();
  await checkA11y(kabir, "matches-with-chat");
  await meeraRow.click();
  await expect(message(kabir, "Hi Kabir! Any Holi plans?")).toBeVisible();
  await kabir.getByLabel("Message", { exact: true }).fill("Colours at Lodhi Garden, then chai?");
  await kabir.getByRole("button", { name: "Send", exact: true }).click();

  // It reaches Meera's open chat live.
  await expect(message(meera, "Colours at Lodhi Garden, then chai?")).toBeVisible();

  // A hurtful word: asked first, nothing sent; she edits and sends.
  await meera.getByLabel("Message", { exact: true }).fill("Don't be an idiot, of course!");
  await meera.getByRole("button", { name: "Send", exact: true }).click();
  await expect(meera.getByText("This might come across as hurtful. Send it anyway?")).toBeVisible();
  await checkA11y(meera, "chat-nudge");
  await meera.getByRole("button", { name: "Edit message" }).click();
  await meera.getByLabel("Message", { exact: true }).fill("Of course! See you at 5.");
  await meera.getByRole("button", { name: "Send", exact: true }).click();
  await expect(message(kabir, "Of course! See you at 5.")).toBeVisible();
  await expect(message(kabir, "Don't be an idiot, of course!")).toHaveCount(0);

  // A message about money brings Meera a safety tip.
  await kabir.getByLabel("Message", { exact: true }).fill("Can you send money on UPI for the tickets?");
  await kabir.getByRole("button", { name: "Send", exact: true }).click();
  await expect(message(meera, "Can you send money on UPI for the tickets?")).toBeVisible();
  await expect(meera.getByText(/^Safety tip: never send money/)).toBeVisible();
  await expect(kabir.getByText(/^Safety tip: never send money/)).toHaveCount(0); // the tip is for the recipient

  // Meera reports that message (blocking him, the default): his open chat closes live.
  // The safety actions wait behind the top bar's More options, in a sheet (stage 20e).
  await meera.getByRole("button", { name: "More options", exact: true }).click();
  await expect(meera.getByRole("dialog", { name: "Options for Kabir" })).toBeVisible();
  await checkA11y(meera, "chat options");
  await meera.getByRole("button", { name: "Report", exact: true }).click();
  await expect(meera.getByRole("heading", { name: "Report Kabir" })).toBeVisible();
  await meera.getByRole("radio", { name: "Scam, or asking for money", exact: true }).click();
  await meera.getByRole("radio", { name: "Message: Can you send money on UPI for the tickets?", exact: true }).click();
  await expect(meera.getByRole("checkbox", { name: "Also block Kabir", exact: true })).toBeChecked();
  await checkA11y(meera, "report");
  await meera.getByRole("button", { name: "Send report" }).click();
  await expect(meera.getByText(/^Thanks for telling us\./)).toBeVisible();
  await expect(kabir.getByText("This conversation isn't available any more.")).toBeVisible();

  // Her Safety screen: the block (with unblock) and the report's status.
  await meera.getByRole("button", { name: "Go to Safety" }).click();
  await expect(meera.getByText("Kabir: Scam, or asking for money. Received")).toBeVisible();
  await expect(meera.getByRole("button", { name: "Unblock Kabir" })).toBeVisible();
  await checkA11y(meera, "safety");

  for (const found of errors) {
    expect(found.server).toEqual([]);
    expect(found.console).toEqual([]);
  }
});
