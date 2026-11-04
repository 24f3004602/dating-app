import { createApi } from "@/api/client";

type Handler = (req: { method: string; path: string; body: unknown; headers: Headers }) => { status: number; body?: unknown; headers?: Record<string, string> };

/**
 * The real openapi-fetch client over a fake `fetch`, so tests exercise the
 * same request building, auth header and error parsing as the app.
 */
export function fakeApi(routes: Record<string, Handler>, token: { value: string | null } = { value: null }) {
  const calls: { method: string; path: string; body: unknown; headers: Headers }[] = [];
  const fetchImpl = (async (input: Request) => {
    const req = input instanceof Request ? input : new Request(input);
    const url = new URL(req.url);
    const text = req.method === "GET" || req.method === "DELETE" ? "" : await req.clone().text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // multipart or plain bodies stay as text
    }
    const call = { method: req.method, path: url.pathname, body, headers: req.headers };
    calls.push(call);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return new Response(JSON.stringify({ code: "not_found", status: 404 }), { status: 404, headers: { "content-type": "application/problem+json" } });
    const res = handler(call);
    const isError = res.status >= 400;
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
      headers: { "content-type": isError ? "application/problem+json" : "application/json", ...(res.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  const onUnauthorized = jest.fn();
  const api = createApi({ getToken: () => token.value, onUnauthorized, fetch: fetchImpl, baseUrl: "http://api.test" });
  return { api, calls, onUnauthorized, token };
}

export const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { type: "about:blank", title: "x", status, code, ...extra },
});
