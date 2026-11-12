// India has no daylight saving: UTC+5:30 all year. The API answers in UTC.
import { t } from "@/i18n/en";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function inIndia(iso: string): Date {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS);
}

/** "14:30" in India. */
export function timeInIndia(iso: string): string {
  const d = inIndia(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "2026-11-05", the date in India (a day ahead of UTC after 18:30 UTC). */
export function dateInIndia(iso: string): string {
  return inIndia(iso).toISOString().slice(0, 10);
}

/**
 * A day as people say it, on India's calendar: "today", "yesterday", else "4 Nov", with
 * the year only when it isn't this year ("4 Nov 2025"). `now` is for tests.
 */
export function dayInIndia(iso: string, now: Date = new Date()): string {
  const d = inIndia(iso);
  const today = inIndia(now.toISOString());
  const days = (x: Date) => Math.floor(x.getTime() / 86_400_000);
  const ago = days(today) - days(d);
  if (ago === 0) return t.time.today;
  if (ago === 1) return t.time.yesterday;
  const day = `${d.getUTCDate()} ${t.time.months[d.getUTCMonth()] ?? ""}`;
  return d.getUTCFullYear() === today.getUTCFullYear() ? day : `${day} ${d.getUTCFullYear()}`;
}
