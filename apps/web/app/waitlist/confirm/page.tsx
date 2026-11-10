import type { Metadata } from "next";
import { connection } from "next/server";

import { LinkPage } from "@/app/waitlist/LinkPage";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = { title: "Confirm your place", referrer: "no-referrer" };

export default async function ConfirmPlace({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  await connection(); // rendered per request, so the CSP nonce applies
  const { t } = await searchParams;
  return (
    <LinkPage
      kind="confirm"
      raw={t}
      title="Confirm your place"
      intro={`Press the button to join the ${BRAND} waitlist. We'll email you once, when it opens.`}
    />
  );
}
