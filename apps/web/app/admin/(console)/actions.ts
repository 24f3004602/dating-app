"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
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

const CHECK_REASONS = new Set(["face_mismatch", "gesture_missing", "unclear"]);

/** The blue tick (D164): approve a selfie, or reject it with why. The API deletes the selfie either way. */
export async function decideCheck(checkId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(checkId);
  const decision = text(form, "decision");
  const reason = text(form, "reason");
  if (decision !== "approve" && decision !== "reject") redirect("/admin/checks?error=invalid");
  if (decision === "reject" && !CHECK_REASONS.has(reason)) redirect("/admin/checks?error=invalid");
  const r = await api(`/v1/admin/photo-checks/${id}/decision`, {
    method: "POST",
    token,
    body: decision === "reject" ? { decision, reason } : { decision },
  });
  redirect(r.ok ? `/admin/checks?done=check_${decision}` : `/admin/checks?error=${r.code}`);
}

const PAYMENT_REASONS = new Set(["not_found", "wrong_amount", "other"]);

/** Admin: a UPI payment found in the bank (approve) or not (reject, with why). D127. */
export async function decidePayment(paymentId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(paymentId);
  const decision = text(form, "decision");
  const reason = text(form, "reason");
  if (decision !== "approve" && decision !== "reject") redirect("/admin/payments?error=invalid");
  if (decision === "reject" && !PAYMENT_REASONS.has(reason)) redirect("/admin/payments?error=invalid");
  const r = await api(`/v1/admin/plus-payments/${id}/decision`, {
    method: "POST",
    token,
    body: decision === "reject" ? { decision, reason } : { decision },
  });
  redirect(r.ok ? `/admin/payments?done=payment_${decision}` : `/admin/payments?error=${r.code}`);
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

/** A member found for a complaint that came by email (D158): what a report shows of them, never their address. */
export type FoundMember = {
  user_id: string;
  display_name: string | null;
  age: number;
  account_status: string;
  joined: string;
  reports_on_subject: number;
  photos: { id: string; moderation_state: string; src: string }[];
};
export type MemberSearch = { results?: FoundMember[]; error?: string };
type ApiMember = Omit<FoundMember, "photos"> & {
  photos: { id: string; moderation_state: string; urls: { small: string } }[];
};

/** Staff: find the member an emailed complaint is about (D158). The search goes in a POST body,
 * never a URL, and its results come back to this page only. */
export async function searchMembers(_previous: MemberSearch, form: FormData): Promise<MemberSearch> {
  const { token } = await requireStaff();
  const email = text(form, "email");
  const age = Number.parseInt(text(form, "age"), 10);
  const body = email ? { email } : { name: text(form, "name"), age: Number.isNaN(age) ? 0 : age };
  const r = await api<ApiMember[]>("/v1/admin/members/search", { method: "POST", token, body });
  if (!r.ok) return { error: r.code };
  return {
    results: r.data.map((m) => ({
      ...m,
      photos: m.photos.map((p) => ({ id: p.id, moderation_state: p.moderation_state, src: `${API_PUBLIC_URL}${p.urls.small}` })),
    })),
  };
}

/** Reject a photo of a member found by search: the IT Rules' two hours (D155) start with the email. */
export async function rejectFoundPhoto(photoId: string): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(photoId);
  const r = await api(`/v1/admin/photos/${id}/decision`, {
    method: "POST",
    token,
    body: { decision: "reject", note: "After a complaint by email (Find a member)." },
  });
  redirect(r.ok ? "/admin/members?done=reject" : `/admin/members?error=${r.code}`);
}

export async function suspendFoundMember(userId: string, form: FormData): Promise<void> {
  const { token } = await requireStaff();
  const id = checkedId(userId);
  const note = text(form, "note");
  if (!note) redirect("/admin/members?error=note_required");
  const r = await api(`/v1/admin/users/${id}/actions`, { method: "POST", token, body: { action: "suspend", note } });
  redirect(r.ok ? "/admin/members?done=suspend" : `/admin/members?error=${r.code}`);
}
