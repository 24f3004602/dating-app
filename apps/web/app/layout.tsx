import "./tokens.css";
import "./fonts.css";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";

import { BRAND } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: "Fewer, better introductions: a short daily set of people who want what you want.",
  robots: { index: false, follow: false }, // not open yet
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The Latin face is on every page that uses it, so fetch it with the page (fonts.css).
  preload("/fonts/anek-latin-v1.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
