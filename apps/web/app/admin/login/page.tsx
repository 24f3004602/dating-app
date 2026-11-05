import type { Metadata } from "next";
import { connection } from "next/server";

import { SignIn } from "./SignIn";

export const metadata: Metadata = { title: "Staff sign-in" };

export default async function LoginPage() {
  await connection();
  return (
    <main className="page narrow">
      <h1>Staff sign-in</h1>
      <p className="muted">For moderators and admins. Member accounts can&apos;t sign in here.</p>
      <SignIn />
    </main>
  );
}
