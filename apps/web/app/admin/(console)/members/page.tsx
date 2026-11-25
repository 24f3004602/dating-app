import type { Metadata } from "next";

import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { DONE, first } from "../labels";
import { MemberSearch } from "./MemberSearch";

export const metadata: Metadata = { title: "Find a member" };

/**
 * For a complaint that came by email (stage 28e-2, D158): find the member it is about, then act as
 * on a report. The IT Rules give two hours for an image that shows someone naked or in a sexual act,
 * or impersonates them (D155), counted from the email.
 */
export default async function Members({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  await requireStaff();
  const query = await searchParams;
  const done = first(query.done);
  const error = first(query.error);
  return (
    <>
      <h1>Find a member</h1>
      <p className="muted">
        For a complaint that came by email. Search by the member&apos;s email address, or by the first name and age
        their profile shows. The audit log records that you searched and how many you found, never what you searched
        for. An image that shows someone naked or in a sexual act, or impersonates them, must be gone within two hours
        of the email.
      </p>
      {done ? (
        <p className="notice success" role="status">
          {DONE[done] ?? "Done."}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {messageFor(error)}
        </p>
      ) : null}
      <MemberSearch />
    </>
  );
}
