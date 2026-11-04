import { ApiError, createApi, unwrap } from "@/api/client";
import { messageFor } from "@/api/messages";
import { t } from "@/i18n/en";
import { fakeApi, problem } from "@/test/fakeApi";

test("sends the session token and returns data", async () => {
  const { api, calls } = fakeApi({ "GET /v1/me": () => ({ status: 200, body: { id: "u1" } }) }, { value: "tok123" });
  const me = await unwrap(api.GET("/v1/me"));
  expect(me).toEqual({ id: "u1" });
  expect(calls[0]?.headers.get("authorization")).toBe("Bearer tok123");
});

test("no token, no authorization header", async () => {
  const { api, calls } = fakeApi({ "GET /v1/areas": () => ({ status: 200, body: [] }) });
  await unwrap(api.GET("/v1/areas"));
  expect(calls[0]?.headers.get("authorization")).toBeNull();
});

test("problem documents become typed ApiErrors", async () => {
  const { api } = fakeApi({
    "POST /v1/auth/login": () => ({ ...problem(429, "rate_limited"), headers: { "retry-after": "42" } }),
    "POST /v1/auth/register": () =>
      problem(422, "validation_error", { errors: [{ field: "body.email", type: "value_error", message: "bad" }] }),
  });
  const limited = await unwrap(api.POST("/v1/auth/login", { body: { email: "a@b.co", password: "x" } })).catch((e) => e);
  expect(limited).toBeInstanceOf(ApiError);
  expect(limited.status).toBe(429);
  expect(limited.retryAfter).toBe(42);
  expect(messageFor(limited)).toBe(t.common.tooMany);

  const invalid = await unwrap(
    api.POST("/v1/auth/register", {
      body: { email: "x", password: "y", birthdate: "1990-01-01", consents: { terms: "a", privacy: "b" } },
    }),
  ).catch((e) => e);
  expect(invalid.code).toBe("validation_error");
  expect(invalid.fieldErrors[0].field).toBe("body.email");
});

test("a 401 with a session forgets it", async () => {
  const token = { value: "expired" };
  const { api, onUnauthorized } = fakeApi({ "GET /v1/me": () => problem(401, "unauthenticated") }, token);
  await expect(unwrap(api.GET("/v1/me"))).rejects.toMatchObject({ status: 401 });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test("network failures are reported as such", async () => {
  const offline = createApi({
    getToken: () => null,
    onUnauthorized: jest.fn(),
    baseUrl: "http://api.test",
    fetch: (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch,
  });
  const error = await unwrap(offline.GET("/v1/areas")).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe("network_error");
  expect(messageFor(error)).toBe(t.common.networkError);
});

test("server text is never shown: codes map to the app's own words", () => {
  expect(messageFor(new ApiError(422, "weak_password", "server wording"))).toBe(t.errors.weak_password);
  expect(messageFor(new ApiError(403, "account_banned"))).toBe(t.signIn.blocked);
  expect(messageFor(new ApiError(500, "something_new"))).toBe(t.common.unknownError);
});
