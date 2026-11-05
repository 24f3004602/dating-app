"use client";

import { useActionState } from "react";

import { messageFor } from "@/lib/messages";

import { issueEnrollment, type IssuedToken } from "../actions";

/** The token comes back to this component once; it is never put in a URL or stored by the console. */
export function ResetAuthenticator({ id, email }: { id: string; email: string }) {
  const [state, act, pending] = useActionState<IssuedToken, FormData>(issueEnrollment.bind(null, id), {});
  if (state.token) {
    return (
      <div role="status">
        <p className="caption">One-time enrolment token for {email}:</p>
        <p className="secret">{state.token}</p>
      </div>
    );
  }
  return (
    <form action={act}>
      {state.error ? (
        <p className="notice error" role="alert">
          {messageFor(state.error)}
        </p>
      ) : null}
      <button className="button danger" type="submit" disabled={pending} aria-label={`Reset the authenticator for ${email}`}>
        Reset
      </button>
    </form>
  );
}
