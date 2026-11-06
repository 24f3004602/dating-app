import type { ReactNode } from "react";

import { BRAND } from "@/lib/config";
import { requireStaff } from "@/lib/session";

import { signOut } from "./actions";
import { Nav } from "./Nav";

/**
 * Every console page sits under this layout, which checks the staff session
 * with the API on the server before anything renders (no session: redirect to
 * sign-in). Server actions check again on their own.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const { staff } = await requireStaff();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="console-header">
        <span className="brand">{BRAND} staff</span>
        <Nav admin={staff.role === "admin"} />
        <form action={signOut}>
          <span className="caption">
            {staff.email} ({staff.role}){" "}
          </span>
          <button className="button secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {staff.recovery_codes_left <= 2 ? (
        <p className="notice" role="status">
          You have {staff.recovery_codes_left} recovery codes left. Ask another admin to reset your authenticator for a
          new set.
        </p>
      ) : null}
      <main id="main" className="page">
        {children}
      </main>
    </>
  );
}
