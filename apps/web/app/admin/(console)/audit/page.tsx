import type { Metadata } from "next";

import { api } from "@/lib/api";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { when } from "../labels";

export const metadata: Metadata = { title: "Audit log" };

type Entry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, string | number | boolean>;
  created_at: string;
};

const short = (id: string | null) => (id ? id.slice(0, 8) : "system");

export default async function Audit() {
  const { token } = await requireStaff();
  const entries = await api<Entry[]>("/v1/admin/audit-log", { token }); // admins only, checked by the API
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">The latest 100 entries. IDs only; opening this page is itself recorded.</p>
      {!entries.ok ? (
        <p className="notice error" role="alert">
          {messageFor(entries.code)}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What</th>
              <th scope="col">Who</th>
              <th scope="col">About</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.data.map((e) => (
              <tr key={e.id}>
                <td>{when(e.created_at)}</td>
                <td>
                  <code>{e.action}</code>
                </td>
                <td>
                  <code>{short(e.actor_id)}</code>
                </td>
                <td>{e.target_type ? `${e.target_type} ${short(e.target_id)}` : ""}</td>
                <td>{Object.entries(e.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
