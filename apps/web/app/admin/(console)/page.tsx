import type { Metadata } from "next";
import Link from "next/link";

import { api } from "@/lib/api";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { ACCOUNT, first, REASONS, STATUS, when } from "./labels";

export const metadata: Metadata = { title: "Reports" };

type QueueItem = {
  id: string;
  reason: string;
  priority: number;
  status: string;
  about: "profile" | "message" | "photo";
  created_at: string;
  subject: { user_id: string; display_name: string | null; account_status: string } | null;
  open_reports_on_subject: number;
};

export default async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const { token } = await requireStaff();
  const error = first((await searchParams).error);
  const queue = await api<QueueItem[]>("/v1/admin/reports", { token });
  return (
    <>
      <h1>Reports</h1>
      <p className="muted">Open and in-review reports, most urgent first. Opening a report is recorded in the audit log.</p>
      {error ? (
        <p className="notice error" role="alert">
          {messageFor(error)}
        </p>
      ) : null}
      {!queue.ok ? (
        <p className="notice error" role="alert">
          {messageFor(queue.code)}
        </p>
      ) : queue.data.length === 0 ? (
        <p>Nothing to review right now.</p>
      ) : (
        <table>
          <caption className="caption">{queue.data.length} reports</caption>
          <thead>
            <tr>
              <th scope="col">Reason</th>
              <th scope="col">About</th>
              <th scope="col">Account</th>
              <th scope="col">Status</th>
              <th scope="col">Received</th>
            </tr>
          </thead>
          <tbody>
            {queue.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/reports/${r.id}`}>{REASONS[r.reason] ?? r.reason}</Link>{" "}
                  {r.priority === 1 ? <span className="badge danger">Urgent</span> : null}
                </td>
                <td>{r.about}</td>
                <td>
                  {r.subject ? `${r.subject.display_name ?? "No profile"} (${ACCOUNT[r.subject.account_status] ?? r.subject.account_status})` : "Account gone"}
                  {r.open_reports_on_subject > 1 ? <span className="badge highlight"> {r.open_reports_on_subject} open</span> : null}
                </td>
                <td>{STATUS[r.status] ?? r.status}</td>
                <td>{when(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
