"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { joinWaitlist } from "@/app/waitlist/actions";
import type { Lang } from "@/lib/i18n";
import { IDLE } from "@/lib/waitlist";

import styles from "./landing.module.css";

/**
 * The waitlist form (stage 20d, D101): an email, the 18+ box, and what we'll do with
 * the address, beside the button. A server action, so it also works without
 * JavaScript. The page has it twice (first screen and last stop), hence the ids.
 * Its words come from the page's language (stage 22a, D120), and it tells the server
 * which language to answer in.
 */
export type FormWords = { email: string; adult: string; consent: string; privacy: string; submit: string; pending: string };

export function WaitlistForm({ lang, words, privacyLang }: { lang: Lang; words: FormWords; privacyLang?: string }) {
  const [state, action, pending] = useActionState(joinWaitlist, IDLE);
  const id = useId();
  const emailError = state.status === "error" && state.field === "email";
  const adultError = state.status === "error" && state.field === "adult";
  const generalError = state.status === "error" && !state.field;
  const email = state.status === "error" ? state.email : undefined;

  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="lang" value={lang} />
      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>{words.email}</label>
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
        <label htmlFor={`${id}-adult`}>{words.adult}</label>
        {adultError && (
          <p id={`${id}-adult-error`} className={styles.fieldError}>
            {state.message}
          </p>
        )}
      </div>
      <p className={styles.consent}>
        {words.consent}{" "}
        <Link href="/privacy" hrefLang={privacyLang}>
          {words.privacy}
        </Link>
      </p>
      <button type="submit" className={styles.plate} disabled={pending}>
        {pending ? words.pending : words.submit}
      </button>
      <div role="status" aria-live="polite" className={styles.result}>
        {state.status === "done" && <p className={styles.done}>{state.message}</p>}
        {generalError && <p className={styles.fieldError}>{state.message}</p>}
      </div>
    </form>
  );
}
