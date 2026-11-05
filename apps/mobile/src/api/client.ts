import type { components, paths } from "@datingapp/api-types";
import createClient, { type Client } from "openapi-fetch";

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

  constructor(
    status: number,
    code: string,
    detail?: string,
    extra?: { errors?: FieldError[]; problems?: string[]; retryAfter?: number | null; purgeAfter?: string | null },
  ) {
    super(detail ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = extra?.errors ?? [];
    this.problems = extra?.problems ?? [];
    this.retryAfter = extra?.retryAfter ?? null;
    this.purgeAfter = extra?.purgeAfter ?? null;
  }
}

export type Api = Client<paths>;

type Options = {
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetch?: typeof fetch;
  baseUrl?: string;
};

export function createApi({ getToken, onUnauthorized, fetch: fetchImpl, baseUrl }: Options): Api {
  const client = createClient<paths>({ baseUrl: baseUrl ?? API_URL, fetch: fetchImpl });
  client.use({
    onRequest({ request }) {
      const token = getToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
    onResponse({ response }) {
      // A revoked or expired session: forget it so the app returns to sign-in.
      if (response.status === 401 && getToken()) onUnauthorized();
      return response;
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
  };
  const retry = Number(response.headers.get("retry-after"));
  return new ApiError(response.status, problem.code ?? "error", problem.detail, {
    errors: problem.errors,
    problems: problem.problems,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
    purgeAfter: typeof problem.purge_after === "string" ? problem.purge_after : null,
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
