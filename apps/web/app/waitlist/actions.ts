"use server";

import { headers } from "next/headers";

import { api } from "@/lib/api";
import { BRAND } from "@/lib/config";
import { type FormState, linkToken, tokenOutcome } from "@/lib/waitlist";

/**
 * The waitlist links' server actions (stage 20d, D101-D102): confirm and leave, for the
 * links already emailed (joining ended when sign-up opened, D133). They run on this
 * server and call the API from here, so the browser needs no API origin in its CSP and
 * the pages work without JavaScript. The visitor's address goes along as Caddy set it.
 */
async function forwardedFor(): Promise<string | undefined> {
  return (await headers()).get("x-forwarded-for") ?? undefined;
}

async function redeemLink(kind: "confirm" | "leave", form: FormData): Promise<FormState> {
  const token = linkToken(form.get("token")?.toString());
  if (!token) return { status: "error", message: "This link is incomplete. Open the link from the email again." };
  const result = await api(`/v1/waitlist/${kind}`, {
    method: "POST",
    body: { token },
    forwardedFor: await forwardedFor(),
  });
  return tokenOutcome(kind, result.ok ? 204 : result.status, result.ok ? "" : result.code, BRAND);
}

export async function confirmPlace(_previous: FormState, form: FormData): Promise<FormState> {
  return redeemLink("confirm", form);
}

export async function leaveWaitlist(_previous: FormState, form: FormData): Promise<FormState> {
  return redeemLink("leave", form);
}
