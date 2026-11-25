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
  payment_approve: "Payment approved: the member's pass has started.",
  payment_reject: "Payment rejected. The member sees why.",
  check_approve: "Approved: the member has the blue tick. The selfie is deleted.",
  check_reject: "Rejected: the member sees why. The selfie is deleted.",
};

/** Why a UPI payment was rejected (D127), as the member is told it. */
export const PAYMENT_REASONS: Record<string, string> = {
  not_found: "No payment with this reference in the bank",
  wrong_amount: "A payment arrived, for another amount",
  other: "Something else (write to the member)",
};

/** The gestures a photo check asks for (D164), in the app's words. */
export const GESTURES: Record<string, string> = {
  thumbs_up: "A thumbs up",
  two_fingers: "Two fingers up",
  three_fingers: "Three fingers up",
  open_palm: "An open palm, facing the camera",
  hand_on_head: "A hand on top of the head",
  chin_on_hand: "Chin resting on a hand",
};

/** Why a photo check was rejected (D164), as the member is told it. */
export const CHECK_REASONS: Record<string, string> = {
  face_mismatch: "Not the person in the photos",
  gesture_missing: "Not the gesture asked for",
  unclear: "The face or the gesture can't be seen",
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
