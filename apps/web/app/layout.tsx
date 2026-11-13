import "./tokens.css";
import "./fonts.css";
import "./globals.css";

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { preload } from "react-dom";

import { BRAND } from "@/lib/config";
import { isLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: "Fewer, better introductions: a short daily set of people who want what you want.",
  robots: { index: false, follow: false }, // not open yet
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The Latin face is on every page that uses it, so fetch it with the page (fonts.css).
  preload("/fonts/anek-latin-v1.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  // The page's language, from its path (proxy.ts; stage 22a, D120): Hindi at /hi only.
  const given = (await headers()).get("x-lang");
  const lang = isLang(given) ? given : "en";
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
