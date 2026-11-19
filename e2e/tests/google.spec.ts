/**
 * Sign in with Google in the web app (D134), against the real API with a stand-in Web
 * client: the button on the welcome, sign-in and sign-up screens, Google's request (a
 * code, PKCE S256, state, only openid email profile), as wide as the sign-in button with
 * Google's G and words sharp (D135), and the return: a cancel goes back
 * where it started, and an answer to a request this tab never made sends nothing. Google's
 * page itself is never reached (the request is caught here); a real Google sign-in is
 * checked by hand on the beta (test-plan.md, GOOGLE-M1).
 */
import { expect, test } from "@playwright/test";

import { E2E_GOOGLE_CLIENT_ID, WEB_URL } from "../env";
import { checkA11y, watchErrors } from "./helpers";

test("Google's page is asked for a code bound to this tab; a cancel comes back; a forged answer sends nothing", async ({ page }) => {
  const errors = await watchErrors(page);
  const asked: URL[] = [];
  await page.route("https://accounts.google.com/**", async (route) => {
    asked.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Google (stand-in)</title>" });
  });
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/v1/auth/google")) sent.push(r.url());
  });

  for (const path of ["/welcome", "/sign-up"]) {
    await page.goto(`${WEB_URL}${path}`);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  }
  await page.goto(`${WEB_URL}/sign-in`);
  const google = page.getByRole("button", { name: "Sign in with Google" });
  await expect(google).toBeVisible();
  // D135: as wide as the Sign in button, with Google's 3x pixels (465 x 60) drawn at 155 x 20.
  const submit = await page.getByRole("button", { name: "Sign in", exact: true }).boundingBox();
  expect((await google.boundingBox())?.width).toBe(submit?.width);
  const art = google.locator("img");
  await expect.poll(() => art.evaluate((el) => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight])).toEqual([465, 60]);
  const drawn = await art.boundingBox();
  expect([drawn?.width, drawn?.height]).toEqual([155, 20]);
  await checkA11y(page, "sign-in with Google's button");
  await google.click();
  await page.waitForURL(/^https:\/\/accounts\.google\.com\//);

  const q = asked[0]?.searchParams;
  expect(q?.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
  expect(q?.get("redirect_uri")).toBe(`${WEB_URL}/auth/google`);
  expect(q?.get("response_type")).toBe("code");
  expect(q?.get("scope")).toBe("openid email profile");
  expect(q?.get("code_challenge_method")).toBe("S256");
  expect(q?.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const state = q?.get("state") ?? "";
  expect(state).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(asked[0]?.toString()).not.toMatch(/client_secret|code_verifier/); // neither ever reaches the browser's URL

  // The person cancels on Google's page: back where they started.
  await page.goto(`${WEB_URL}/auth/google?error=access_denied&state=${state}`);
  await expect(page).toHaveURL(`${WEB_URL}/sign-in`);

  // An answer to a request this tab never made (or made twice): refused before the API is asked.
  await page.goto(`${WEB_URL}/auth/google?code=forged-code-123&state=${state}`);
  await expect(page.getByText("That Google sign-in didn't work. Please try again.")).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/auth/google`); // the code doesn't stay in the address bar
  await checkA11y(page, "back from Google, refused");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(`${WEB_URL}/welcome`); // the request was used up by the cancel
  expect(sent).toEqual([]);
  expect(errors.console).toEqual([]);
  expect(errors.server).toEqual([]);
});
