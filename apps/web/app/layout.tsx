import "./tokens.css";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Haanji", template: "%s · Haanji" },
  description: "Fewer, better introductions: a short daily set of people who want what you want.",
  robots: { index: false, follow: false }, // not open yet
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
