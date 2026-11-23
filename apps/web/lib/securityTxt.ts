/**
 * /.well-known/security.txt (RFC 9116, D145): how to report a security problem.
 *
 * - Contact: the address the privacy notice already shows (CONTACT_EMAIL), so nothing new is
 *   published. With no contact there is no file (404), never one without a way to reach us.
 * - Expires: 180 days after the start of today (UTC); the RFC asks for under a year, and a
 *   date that moves only once a day keeps the file cacheable.
 * - Canonical: where the file lives, when the site knows its own address (SITE_URL).
 * - Preferred-Languages: English and Hindi, the site's two languages.
 */
export const EXPIRES_DAYS = 180;

export function securityTxt({ contact, site, now }: { contact: string | null; site: string | null; now: Date }): string | null {
  if (!contact) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expires = new Date(today + EXPIRES_DAYS * 86_400_000).toISOString();
  const lines = [`Contact: mailto:${contact}`, `Expires: ${expires}`, "Preferred-Languages: en, hi"];
  if (site) lines.push(`Canonical: ${site}/.well-known/security.txt`);
  return `${lines.join("\n")}\n`;
}
