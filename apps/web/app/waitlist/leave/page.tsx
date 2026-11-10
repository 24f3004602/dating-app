import type { Metadata } from "next";
import { connection } from "next/server";

import { LinkPage } from "@/app/waitlist/LinkPage";

export const metadata: Metadata = { title: "Leave the waitlist", referrer: "no-referrer" };

export default async function LeaveWaitlist({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  await connection(); // rendered per request, so the CSP nonce applies
  const { t } = await searchParams;
  return (
    <LinkPage
      kind="leave"
      raw={t}
      title="Leave the waitlist"
      intro="Press the button to delete your address from the waitlist. We won't email you again."
    />
  );
}
