import { type NextRequest, NextResponse } from "next/server";

import { heroVideoConfig, heroVideoOrigins } from "@/lib/heroVideo";

/**
 * A strict Content-Security-Policy with a fresh nonce per request (Next.js CSP
 * guide, v16). Next.js reads the nonce from the request's CSP header and puts
 * it on its own scripts, so pages render dynamically. Photos come from the
 * API's signed URLs, so its origin is allowed for images only.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const apiOrigin = new URL(
    process.env.API_PUBLIC_URL ??
      process.env.API_URL ??
      "http://127.0.0.1:8000",
  ).origin;
  // The landing hero's video, only if one is configured (stage 19, D098; off by default).
  const video = heroVideoOrigins(heroVideoConfig(process.env));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    `img-src 'self' data: ${[apiOrigin, ...video.img].join(" ")}`,
    `media-src 'self'${video.media.map((o) => ` ${o}`).join("")}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
