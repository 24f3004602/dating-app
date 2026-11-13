import type { Metadata } from "next";

import { Landing } from "@/app/Landing";
import { messages } from "@/lib/i18n";

const t = messages("hi");

export const metadata: Metadata = { title: t.meta.title, description: t.meta.description };

/** The landing page in Hindi (stage 22a, D120): the whole page, never beside the English. */
export default function HindiPage() {
  return <Landing lang="hi" />;
}
