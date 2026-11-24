/**
 * Settings a production website must have (D147). Without them `lib/config.ts` falls back to
 * this machine (127.0.0.1): the server would reach no API, and Create an account would point
 * visitors at their own computer. So a production start without them stops instead (see
 * instrumentation.ts). Development and `next build` are left alone.
 */
export const REQUIRED_IN_PRODUCTION = ["API_URL", "APP_URL"] as const;

export function missingSettings(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return [];
  return REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim());
}
