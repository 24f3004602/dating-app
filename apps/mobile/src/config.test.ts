/** Build-time settings for the beta build (D096). */
const KEYS = ["EXPO_PUBLIC_TERMS_VERSION", "EXPO_PUBLIC_PRIVACY_VERSION", "EXPO_PUBLIC_WEB_URL", "EXPO_PUBLIC_INVITE_ONLY"];

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

function load(): typeof import("@/config") {
  let config: typeof import("@/config") | undefined;
  jest.isolateModules(() => {
    config = require("@/config");
  });
  return config!;
}

test("development defaults: draft documents, open sign-up, a local website", () => {
  const config = load();
  expect(config.DOCUMENT_VERSIONS).toEqual({ terms: "draft-2026-11", privacy: "draft-2026-11" });
  expect(config.BETA_DOCUMENTS).toBe(false);
  expect(config.INVITE_ONLY).toBe(false);
  expect(config.DOCUMENT_LINKS.terms).toBe("http://127.0.0.1:3000/terms");
});

test("the beta build: the tester notice, invite-only, the beta website", () => {
  process.env.EXPO_PUBLIC_TERMS_VERSION = "beta-2026-11";
  process.env.EXPO_PUBLIC_PRIVACY_VERSION = "beta-2026-11";
  process.env.EXPO_PUBLIC_WEB_URL = "https://example.in/";
  process.env.EXPO_PUBLIC_INVITE_ONLY = "1";
  const config = load();
  expect(config.DOCUMENT_VERSIONS).toEqual({ terms: "beta-2026-11", privacy: "beta-2026-11" });
  expect(config.BETA_DOCUMENTS).toBe(true);
  expect(config.INVITE_ONLY).toBe(true);
  expect(config.DOCUMENT_LINKS).toEqual({ terms: "https://example.in/terms", privacy: "https://example.in/privacy" });
});
