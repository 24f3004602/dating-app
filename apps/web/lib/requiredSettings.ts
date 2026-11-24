/**
 * Settings a production website must have (D147). Without them `lib/config.ts` falls back to
 * this machine (127.0.0.1): the server would reach no API, and Create an account would point
 * visitors at their own computer. Without CONTACT_EMAIL (D150) the privacy notice, security.txt
 * and the account-deletion page would offer no way to reach us, which Google Play's deletion
 * rules and the notice's own promises need. So a production start without them stops instead
 * (see instrumentation.ts). Development and `next build` are left alone.
 */
export const REQUIRED_IN_PRODUCTION = ["API_URL", "APP_URL", "CONTACT_EMAIL"] as const;

export function missingSettings(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return [];
  return REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim());
}
