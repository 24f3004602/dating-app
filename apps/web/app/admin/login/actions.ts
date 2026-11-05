"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import { messageFor } from "@/lib/messages";
import { clearChallenge, getChallenge, setChallenge, startStaffSession } from "@/lib/session";

/**
 * Staff sign-in in steps (D090). The challenge between steps lives in an
 * HttpOnly cookie, so page scripts never see it. Each step is a server action:
 * Next.js only runs it when the Origin matches the host (CSRF), and the API
 * checks everything again.
 */
export type Step =
  | { stage: "password"; error?: string; email?: string }
  | { stage: "enroll"; error?: string }
  | { stage: "confirm"; secret: string; uri: string; error?: string }
  | { stage: "code"; error?: string }
  | { stage: "codes"; recoveryCodes: string[] };

type Challenge = { challenge: string; expires_at: string; next: "verify" | "enroll" };
type Enrolled = { secret: string; otpauth_uri: string };
type Session = { token: string; expires_at: string; recovery_codes: string[] | null };

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function signInStep(previous: Step, form: FormData): Promise<Step> {
  const stage = field(form, "stage");

  if (stage === "password") {
    const email = field(form, "email").trim().toLowerCase();
    const r = await api<Challenge>("/v1/admin/auth/login", {
      method: "POST",
      body: { email, password: field(form, "password") },
    });
    // The email comes back so the reset form keeps it (React resets forms after an action).
    if (!r.ok) return { stage: "password", error: messageFor(r.code), email };
    await setChallenge(r.data.challenge, r.data.expires_at);
    return r.data.next === "enroll" ? { stage: "enroll" } : { stage: "code" };
  }

  const challenge = await getChallenge();
  if (!challenge) return { stage: "password", error: messageFor("challenge_invalid") };

  if (stage === "enroll") {
    const r = await api<Enrolled>("/v1/admin/auth/enroll", {
      method: "POST",
      body: { challenge, enrollment_token: field(form, "token").trim() },
    });
    if (!r.ok) return (await restart(r.code)) ?? { stage: "enroll", error: messageFor(r.code) };
    return { stage: "confirm", secret: r.data.secret, uri: r.data.otpauth_uri };
  }

  if (stage === "code" || stage === "confirm") {
    const r = await api<Session>("/v1/admin/auth/verify", {
      method: "POST",
      body: { challenge, code: field(form, "code").trim() },
    });
    if (!r.ok) {
      const again = await restart(r.code);
      if (again) return again;
      return previous.stage === "confirm"
        ? { ...previous, error: messageFor(r.code) }
        : { stage: "code", error: messageFor(r.code) };
    }
    await startStaffSession(r.data.token, r.data.expires_at);
    if (r.data.recovery_codes) return { stage: "codes", recoveryCodes: r.data.recovery_codes };
    redirect("/admin");
  }

  return { stage: "password" };
}

/** An expired or used-up challenge means starting again from the password. */
async function restart(code: string): Promise<Step | null> {
  if (code !== "challenge_invalid") return null;
  await clearChallenge();
  return { stage: "password", error: messageFor(code) };
}
