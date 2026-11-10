import "server-only";

import { API_URL } from "@/lib/config";

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string };

/** Calls the API from this server. The staff token is sent as a bearer token and never leaves the server. */
export async function api<T>(
  path: string,
  {
    method = "GET",
    body,
    token,
    forwardedFor,
  }: { method?: string; body?: unknown; token?: string; forwardedFor?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  // The visitor's address as Caddy passed it on, so per-IP limits count visitors, not
  // this server. The API believes it only from trusted proxies (TRUSTED_PROXIES).
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: json as T };
  const code = typeof json === "object" && json && "code" in json ? String((json as { code: unknown }).code) : "error";
  return { ok: false, status: res.status, code };
}
