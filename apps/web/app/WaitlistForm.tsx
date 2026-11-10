"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { joinWaitlist } from "@/app/waitlist/actions";
import { IDLE } from "@/lib/waitlist";

import styles from "./landing.module.css";

/**
 * The waitlist form (stage 20d, D101): an email, the 18+ box, and what we'll do with
 * the address, beside the button. A server action, so it also works without
 * JavaScript. The page has it twice (first screen and last stop), hence the ids.
 */
export function WaitlistForm({ brand }: { brand: string }) {
  const [state, action, pending] = useActionState(joinWaitlist, IDLE);
  const id = useId();
  const emailError = state.status === "error" && state.field === "email";
  const adultError = state.status === "error" && state.field === "adult";
  const generalError = state.status === "error" && !state.field;
  const email = state.status === "error" ? state.email : undefined;

  return (
    <form action={action} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>Your email address</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          defaultValue={email}
          key={state.status === "done" ? "cleared" : "kept"}
          aria-invalid={emailError || undefined}
          aria-describedby={emailError ? `${id}-email-error` : undefined}
        />
        {emailError && (
          <p id={`${id}-email-error`} className={styles.fieldError}>
            {state.message}
          </p>
        )}
      </div>
      <div className={styles.check}>
        <input
          id={`${id}-adult`}
          name="adult"
          type="checkbox"
          value="yes"
          required
          aria-invalid={adultError || undefined}
          aria-describedby={adultError ? `${id}-adult-error` : undefined}
        />
        <label htmlFor={`${id}-adult`}>I&apos;m 18 or over</label>
        {adultError && (
          <p id={`${id}-adult-error`} className={styles.fieldError}>
            {state.message}
          </p>
        )}
      </div>
      <p className={styles.consent}>
        We&apos;ll email you to confirm, then once when {brand} opens. Nothing else.{" "}
        <Link href="/privacy">Privacy notice</Link>
      </p>
      <button type="submit" className={styles.plate} disabled={pending}>
        {pending ? "Adding you…" : "Join the waitlist"}
      </button>
      <div role="status" aria-live="polite" className={styles.result}>
        {state.status === "done" && <p className={styles.done}>{state.message}</p>}
        {generalError && <p className={styles.fieldError}>{state.message}</p>}
      </div>
    </form>
  );
}
