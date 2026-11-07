import path from "node:path";

import type { NextConfig } from "next";

// Security headers for every response. The Content-Security-Policy, with a
// fresh nonce per request, is set in proxy.ts (Next.js CSP guide).
const nextConfig: NextConfig = {
  // The container image (Dockerfile) builds a standalone server, traced from the
  // monorepo root; local builds and the e2e keep `next start`.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.join(__dirname, "../.."),
      }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      // The loop video and its posters (stage 19, D099): versioned file names
      // (candles-v1-...), so browsers and Cloudflare may keep them for a year.
      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
