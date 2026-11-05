"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import { endStaffSession, requireStaff } from "@/lib/session";

/**
 * Console mutations. Each one is reachable by a direct POST, so each checks
 * the staff session itself (`requireStaff`) and validates its input; the API
 * checks role and rules again. Results travel as short codes in the URL, never data.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPORT_ACTIONS = new Set(["dismiss", "warn", "remove_photo", "remove_message", "suspend", "ban"]);
const ACCOUNT_ACTIONS = new Set(["suspend", "ban", "reinstate"]);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function checkedId(value: string): string {
  if (!UUID.test(value)) redirect("/admin?error=not_found");
  return value;
}

export async function actOnReport(reportId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(reportId);
  const action = text(form, "action");
  if (!REPORT_ACTIONS.has(action)) redirect(`/admin/reports/${id}?error=invalid`);
  const note = text(form, "note");
  const r = await api(`/v1/admin/reports/${id}/actions`, {
    method: "POST",
    token,
    body: note ? { action, note } : { action },
  });
  redirect(r.ok ? `/admin/reports/${id}?done=${action}` : `/admin/reports/${id}?error=${r.code}`);
}

export async function actOnAccount(userId: string, reportId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(userId);
  const back = `/admin/reports/${checkedId(reportId)}`;
  const action = text(form, "action");
  const note = text(form, "note");
  if (!ACCOUNT_ACTIONS.has(action) || !note) redirect(`${back}?error=note_required`);
  const r = await api(`/v1/admin/users/${id}/actions`, { method: "POST", token, body: { action, note } });
  redirect(r.ok ? `${back}?done=${action}` : `${back}?error=${r.code}`);
}

export async function decidePhoto(photoId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(photoId);
  const decision = text(form, "decision");
  if (decision !== "approve" && decision !== "reject") redirect("/admin/photos?error=invalid");
  const r = await api(`/v1/admin/photos/${id}/decision`, { method: "POST", token, body: { decision } });
  redirect(r.ok ? `/admin/photos?done=${decision}` : `/admin/photos?error=${r.code}`);
}

export type IssuedToken = { token?: string; expiresAt?: string; error?: string };

/** Admin: reset someone's authenticator. The token is returned to this page once, never put in a URL. */
export async function issueEnrollment(userId: string, _previous: IssuedToken, _form: FormData): Promise<IssuedToken> {
  const { token } = await requireStaff();
  if (!UUID.test(userId)) return { error: "not_found" };
  const r = await api<{ enrollment_token: string; expires_at: string }>(`/v1/admin/staff/${userId}/enrollment`, {
    method: "POST",
    token,
  });
  return r.ok ? { token: r.data.enrollment_token, expiresAt: r.data.expires_at } : { error: r.code };
}

export async function signOut(): Promise<void> {
  const token = await endStaffSession();
  if (token) await api("/v1/admin/auth/logout", { method: "POST", token });
  redirect("/admin/login");
}
