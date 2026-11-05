import { connection } from "next/server";

// Rendered per request like every other page, so its scripts carry the CSP
// nonce. The built-in static 404 had none: its scripts and inline styles were
// blocked (BUG-001, found in the stage 15 audit).
export default async function NotFound() {
  await connection();
  return (
    <main className="page narrow">
      <h1>Page not found</h1>
      <p>There&apos;s nothing at this address.</p>
      <p>
        <a href="/">Go to the home page</a>
      </p>
    </main>
  );
}
