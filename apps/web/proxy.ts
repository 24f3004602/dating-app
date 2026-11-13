import { type NextRequest, NextResponse } from "next/server";

import { heroVideoOrigins } from "@/lib/heroVideo";
import { langForPath } from "@/lib/i18n";

/**
 * A strict Content-Security-Policy with a fresh nonce per request (Next.js CSP
 * guide, v16). Next.js reads the nonce from the request's CSP header and puts
 * it on its own scripts, so pages render dynamically. Photos come from the
 * API's signed URLs, so its origin is allowed for images only. 'wasm-unsafe-eval'
 * lets the first screen's 3D scene compile its physics engine (WebAssembly, bundled
 * with the site's own scripts; stage 21a, D119); it allows no JavaScript eval.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const apiOrigin = new URL(
    process.env.API_PUBLIC_URL ??
      process.env.API_URL ??
      "http://127.0.0.1:8000",
  ).origin;
  // The loop video's origin, when it's served from elsewhere (MEDIA_BASE_URL; stage 19, D099).
  const video = heroVideoOrigins(process.env);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
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
  // The page's language for <html lang> (stage 22a, D120); always set here, so a
  // visitor's own x-lang header never reaches the layout.
  requestHeaders.set("x-lang", langForPath(request.nextUrl.pathname));
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static files need no policy of their own: Next's assets, the icon and /media (the loop video).
      source: "/((?!_next/static|_next/image|favicon.ico|media/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
