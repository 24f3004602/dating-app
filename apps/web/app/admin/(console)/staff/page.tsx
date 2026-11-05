import type { Metadata } from "next";

import { api } from "@/lib/api";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { ResetAuthenticator } from "./ResetAuthenticator";

export const metadata: Metadata = { title: "Staff" };

type Member = { id: string; email: string; role: "moderator" | "admin"; enrolled: boolean };

export default async function Staff() {
  const { staff, token } = await requireStaff();
  const list = await api<Member[]>("/v1/admin/staff", { token }); // admins only, checked by the API
  return (
    <>
      <h1>Staff</h1>
      <p className="muted">
        Resetting an authenticator signs that person out of the console and gives you a one-time enrolment token. Hand
        it over in person or by phone, never by email or chat. It works once, within 24 hours.
      </p>
      {!list.ok ? (
        <p className="notice error" role="alert">
          {messageFor(list.code)}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Authenticator</th>
              <th scope="col">Reset</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((m) => (
              <tr key={m.id}>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>{m.enrolled ? "Set up" : "Not set up"}</td>
                <td>{m.id === staff.id ? <span className="caption">Another admin resets yours</span> : <ResetAuthenticator id={m.id} email={m.email} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
