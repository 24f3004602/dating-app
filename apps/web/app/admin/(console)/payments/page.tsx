import type { Metadata } from "next";

import { api } from "@/lib/api";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { decidePayment } from "../actions";
import { DONE, first, PAYMENT_REASONS, when } from "../labels";

export const metadata: Metadata = { title: "Payments" };

/** A Plus pass payment as the API shows it to admins (D127): nothing about the member. */
type Payment = {
  id: string;
  code: string;
  status: "open" | "submitted" | "approved" | "rejected" | "expired";
  amount: number;
  currency: string;
  days: number;
  utr: string | null;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  plus_until: string | null;
};

function rupees(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100);
}

/**
 * Admins check each UPI payment against the bank account (D127): find the UPI reference
 * in the bank's statement or app, check the amount, then approve (the member's pass starts)
 * or reject with why. The API audits every view and decision.
 */
export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const { token, staff } = await requireStaff();
  const query = await searchParams;
  const done = first(query.done);
  const error = first(query.error);
  if (staff.role !== "admin") {
    return (
      <>
        <h1>Payments</h1>
        <p className="notice error" role="alert">
          {messageFor("admin_only")}
        </p>
      </>
    );
  }
  const waiting = await api<Payment[]>("/v1/admin/plus-payments", { token });
  const approved = await api<Payment[]>("/v1/admin/plus-payments?status=approved&limit=20", { token });
  const rejected = await api<Payment[]>("/v1/admin/plus-payments?status=rejected&limit=20", { token });
  const decided = [...(approved.ok ? approved.data : []), ...(rejected.ok ? rejected.data : [])].sort((a, b) =>
    (b.decided_at ?? "").localeCompare(a.decided_at ?? ""),
  );
  return (
    <>
      <h1>Payments</h1>
      <p className="muted">
        Plus passes paid by UPI to your UPI ID. For each one, find its UPI reference in your bank&apos;s statement or
        app and check the amount. Approve only what you can see there; the member&apos;s pass starts at once. Oldest
        first.
      </p>
      {done ? (
        <p className="notice success" role="status">
          {DONE[done] ?? "Done."}
        </p>
      ) : null}
      {error || !waiting.ok ? (
        <p className="notice error" role="alert">
          {messageFor(error ?? (waiting.ok ? "error" : waiting.code))}
        </p>
      ) : null}
      {waiting.ok && waiting.data.length === 0 ? <p>No payments waiting.</p> : null}
      {waiting.ok && waiting.data.length > 0 ? (
        <table>
          <caption className="caption">{waiting.data.length} waiting</caption>
          <thead>
            <tr>
              <th scope="col">UPI reference</th>
              <th scope="col">Amount</th>
              <th scope="col">Note code</th>
              <th scope="col">Sent</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {waiting.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <code>{p.utr}</code>
                </td>
                <td>{rupees(p.amount, p.currency)}</td>
                <td>
                  <code>{p.code}</code>
                </td>
                <td>{p.submitted_at ? when(p.submitted_at) : ""}</td>
                <td>
                  <form action={decidePayment.bind(null, p.id)} className="inline-form">
                    <button
                      className="button secondary"
                      type="submit"
                      name="decision"
                      value="approve"
                      aria-label={`Approve the payment with reference ${p.utr}`}
                    >
                      Approve
                    </button>
                    <div className="field">
                      <label htmlFor={`reason-${p.id}`}>If rejecting, why</label>
                      <select id={`reason-${p.id}`} name="reason" defaultValue="not_found">
                        {Object.entries(PAYMENT_REASONS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="button danger"
                      type="submit"
                      name="decision"
                      value="reject"
                      aria-label={`Reject the payment with reference ${p.utr}`}
                    >
                      Reject
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h2>Recently decided</h2>
      {decided.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">UPI reference</th>
              <th scope="col">Amount</th>
              <th scope="col">Decision</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {decided.map((p) => (
              <tr key={p.id}>
                <td>
                  <code>{p.utr}</code>
                </td>
                <td>{rupees(p.amount, p.currency)}</td>
                <td>
                  {p.status === "approved"
                    ? `Approved: Plus until ${p.plus_until ? when(p.plus_until) : ""}`
                    : `Rejected: ${PAYMENT_REASONS[p.reject_reason ?? "other"] ?? p.reject_reason}`}
                </td>
                <td>{p.decided_at ? when(p.decided_at) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
