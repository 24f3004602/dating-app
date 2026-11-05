/** Plain words for the API's codes in the console. */
export const REASONS: Record<string, string> = {
  fake: "Fake profile",
  harassment: "Harassment",
  explicit: "Explicit content",
  scam: "Scam, or asking for money",
  underage: "May be under 18",
  hate: "Hate",
  other: "Something else",
};

export const STATUS: Record<string, string> = {
  open: "Open",
  in_review: "Being reviewed",
  actioned: "Action taken",
  dismissed: "Dismissed",
};

export const ACCOUNT: Record<string, string> = {
  pending: "Unverified",
  active: "Active",
  suspended: "Suspended",
  banned: "Banned",
  deactivated: "Leaving (deletion requested)",
};

export const DONE: Record<string, string> = {
  dismiss: "Report dismissed.",
  warn: "Warning recorded.",
  remove_photo: "Photo removed.",
  remove_message: "Message removed.",
  suspend: "Account suspended.",
  ban: "Account banned.",
  reinstate: "Account reinstated.",
  approve: "Photo approved.",
  reject: "Photo rejected.",
};

export function when(iso: string): string {
  // India time, as the app shows it.
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );
}

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
