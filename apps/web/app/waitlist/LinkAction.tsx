"use client";

import { useActionState } from "react";

import { confirmPlace, leaveWaitlist } from "@/app/waitlist/actions";
import { IDLE } from "@/lib/waitlist";

import styles from "../landing.module.css";

/**
 * The button behind a waitlist email's link (stage 20d, D102). Opening the page does
 * nothing: mail scanners open links, so confirming or leaving takes a press (a POST).
 */
export function LinkAction({ kind, token }: { kind: "confirm" | "leave"; token: string }) {
  const [state, action, pending] = useActionState(kind === "confirm" ? confirmPlace : leaveWaitlist, IDLE);
  const label = kind === "confirm" ? "Confirm my place" : "Remove my address";

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token" value={token} />
      {state.status !== "done" && (
        <button type="submit" className={styles.plate} disabled={pending}>
          {pending ? "One moment…" : label}
        </button>
      )}
      <div role="status" aria-live="polite" className={styles.result}>
        {state.status === "done" && <p className={styles.done}>{state.message}</p>}
        {state.status === "error" && <p className={styles.fieldError}>{state.message}</p>}
      </div>
    </form>
  );
}
