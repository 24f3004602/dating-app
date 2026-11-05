import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { api } from "@/lib/api";
import { CHALLENGE_COOKIE, STAFF_COOKIE } from "@/lib/config";

export type Staff = { id: string; email: string; role: "moderator" | "admin"; recovery_codes_left: number };

const BASE = { httpOnly: true, secure: true, sameSite: "strict", path: "/" } as const;

/**
 * The signed-in staff member, checked with the API on every request (the API
 * is the authority: idle timeout, 12-hour limit, revocation, role). Pages and
 * every server action call this; no page or action trusts the cookie alone.
 */
export const requireStaff = cache(async (): Promise<{ staff: Staff; token: string }> => {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) redirect("/admin/login");
  const me = await api<Staff>("/v1/admin/auth/me", { token });
  if (!me.ok) {
    if (me.status === 401 || me.status === 403) redirect("/admin/login");
    throw new Error("The API is unavailable.");
  }
  return { staff: me.data, token };
});

export async function startStaffSession(token: string, expiresAt: string): Promise<void> {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, token, { ...BASE, expires: new Date(expiresAt) });
  jar.delete({ name: CHALLENGE_COOKIE, ...BASE });
}

export async function endStaffSession(): Promise<string | undefined> {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE)?.value;
  jar.delete({ name: STAFF_COOKIE, ...BASE });
  return token;
}

export async function setChallenge(challenge: string, expiresAt: string): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, { ...BASE, expires: new Date(expiresAt) });
}

export async function getChallenge(): Promise<string | undefined> {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value;
}

export async function clearChallenge(): Promise<void> {
  (await cookies()).delete({ name: CHALLENGE_COOKIE, ...BASE });
}
