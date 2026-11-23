import { SITE_URL } from "@/lib/config";
import { CONTACT_EMAIL } from "@/lib/documents";
import { securityTxt } from "@/lib/securityTxt";

// Built at request time: the contact comes from the server's settings, and Expires from today (D145).
export const dynamic = "force-dynamic";

export function GET(): Response {
  const body = securityTxt({ contact: CONTACT_EMAIL, site: SITE_URL, now: new Date() });
  const headers = { "Content-Type": "text/plain; charset=utf-8" };
  if (body === null) return new Response("Not found\n", { status: 404, headers });
  return new Response(body, { headers: { ...headers, "Cache-Control": "public, max-age=86400" } });
}
