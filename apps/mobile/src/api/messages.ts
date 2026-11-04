import { ApiError } from "@/api/client";
import { t } from "@/i18n/en";

/** The app's own words for an error code; server text is not shown (i18n). */
export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return t.common.unknownError;
  if (error.code === "network_error") return t.common.networkError;
  if (error.code === "rate_limited") return t.common.tooMany;
  if (error.code === "invalid_credentials") return t.signIn.invalid;
  if (error.code === "email_not_verified") return t.signIn.notVerified;
  if (error.code.startsWith("account_")) return t.signIn.blocked;
  if (error.code === "verification_failed") return t.verify.failed;
  if (error.code === "area_change_limited") return t.editProfile.areaLimited;
  const known = (t.errors as Record<string, string>)[error.code];
  return known ?? t.common.unknownError;
}

/** Field-level messages from a 422 validation problem, keyed by body field. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const e of error.fieldErrors) {
    const field = e.field.replace(/^body\./, "").split(".")[0] ?? e.field;
    out[field] ??= t.common.unknownError;
  }
  return out;
}
