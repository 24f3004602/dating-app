import type { components, paths } from "@datingapp/api-types";
import createClient, { type Client } from "openapi-fetch";

import { COOKIE_SESSIONS, cookieModeFor } from "@/auth/webSession";
import { API_URL } from "@/config";

export type Schemas = components["schemas"];
export type FieldError = Schemas["FieldError"];

/** An RFC 9457 problem from the API, or a local network failure (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];
  readonly problems: string[];
  readonly retryAfter: number | null;
  /** `deletion_scheduled`: when the account will be deleted (D083). */
  readonly purgeAfter: string | null;
  /** `consent_required`: the document versions the server asks for now (D159). */
  readonly requiredVersions: DocumentVersions | null;

  constructor(
    status: number,
    code: string,
    detail?: string,
    extra?: {
      errors?: FieldError[];
      problems?: string[];
      retryAfter?: number | null;
      purgeAfter?: string | null;
      requiredVersions?: DocumentVersions | null;
    },
  ) {
    super(detail ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = extra?.errors ?? [];
    this.problems = extra?.problems ?? [];
    this.retryAfter = extra?.retryAfter ?? null;
    this.purgeAfter = extra?.purgeAfter ?? null;
    this.requiredVersions = extra?.requiredVersions ?? null;
  }
}

export type DocumentVersions = { terms: string; privacy: string };
const VERSION = /^[a-z0-9][a-z0-9.-]{0,31}$/;

/** The versions a `consent_required` problem names, if they look like versions (D159). */
function documentVersions(value: unknown): DocumentVersions | null {
  if (!value || typeof value !== "object") return null;
  const { terms, privacy } = value as { terms?: unknown; privacy?: unknown };
  if (typeof terms !== "string" || typeof privacy !== "string") return null;
  return VERSION.test(terms) && VERSION.test(privacy) ? { terms, privacy } : null;
}

export type Api = Client<paths>;

type Options = {
  getToken: () => string | null;
  /** Whether this app holds a session: the web app's lives in a cookie it can't see (D152). */
  hasSession?: () => boolean;
  onUnauthorized: () => void;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** The web app: the session travels in the API's HttpOnly cookie (D152). */
  cookies?: boolean;
};

export function createApi({
  getToken, hasSession, onUnauthorized, fetch: fetchImpl, baseUrl, cookies = COOKIE_SESSIONS,
}: Options): Api {
  const client = createClient<paths>({
    baseUrl: baseUrl ?? API_URL,
    fetch: fetchImpl,
    ...(cookies ? { credentials: "include" as const } : {}),
  });
  client.use({
    onRequest({ request }) {
      const token = getToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      const mode = cookieModeFor(request.method, request.url, cookies);
      if (mode) request.headers.set("X-Session-Cookie", mode);
      return request;
    },
    onResponse({ response }) {
      // A revoked or expired session: forget it so the app returns to sign-in.
      if (response.status === 401 && (getToken() || hasSession?.())) onUnauthorized();
      // Return nothing: the response is unchanged. openapi-fetch requires anything returned
      // here to be `instanceof Response`, which React Native's fetch responses are not, so
      // returning it failed every call on Android (BUG-004).
    },
  });
  return client;
}

type Result<T> = { data?: T; error?: unknown; response: Response };

function toApiError(response: Response, body: unknown): ApiError {
  const problem = (body ?? {}) as {
    code?: string;
    detail?: string;
    errors?: FieldError[];
    problems?: string[];
    purge_after?: string;
    required?: unknown;
  };
  const retry = Number(response.headers.get("retry-after"));
  return new ApiError(response.status, problem.code ?? "error", problem.detail, {
    errors: problem.errors,
    problems: problem.problems,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
    purgeAfter: typeof problem.purge_after === "string" ? problem.purge_after : null,
    requiredVersions: problem.code === "consent_required" ? documentVersions(problem.required) : null,
  });
}

/** Resolve an openapi-fetch call to its data, or throw an ApiError. */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, "network_error");
  }
  if (!result.response.ok) throw toApiError(result.response, result.error);
  return result.data as T;
}
