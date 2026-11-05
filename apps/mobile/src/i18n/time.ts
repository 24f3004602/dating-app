// India has no daylight saving: UTC+5:30 all year. The API answers in UTC.
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
