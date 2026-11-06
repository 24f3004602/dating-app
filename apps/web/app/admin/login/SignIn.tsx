"use client";

import { useActionState } from "react";

import { signInStep, type Step } from "./actions";

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="notice error" role="alert">
      {message}
    </p>
  );
}

/** One form per step; the server decides the next step. Works without client JS too (progressive forms). */
export function SignIn({ brand }: { brand: string }) {
  const [step, act, pending] = useActionState<Step, FormData>(signInStep, { stage: "password" });

  if (step.stage === "codes") {
    return (
      <section aria-labelledby="codes-title">
        {/* The session cookie refreshes the route, which dropped the page title (axe); React hoists this one. */}
        <title>{`Save your recovery codes · ${brand}`}</title>
        <h2 id="codes-title">Save your recovery codes</h2>
        <p>
          If you lose your phone, each of these codes signs you in once instead of an authenticator code. Keep them
          somewhere safe and offline. They won&apos;t be shown again.
        </p>
        <ol className="codes" aria-label="Recovery codes">
          {step.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <a className="button" href="/admin">
          I&apos;ve saved them: open the console
        </a>
      </section>
    );
  }

  return (
    <form action={act} aria-busy={pending}>
      <input type="hidden" name="stage" value={step.stage} />
      <FormError message={step.error} />
      {step.stage === "password" ? (
        <>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" defaultValue={step.email} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="button" type="submit" disabled={pending}>
            Continue
          </button>
        </>
      ) : null}

      {step.stage === "enroll" ? (
        <>
          <p>
            Set up an authenticator app first. You need a one-time enrolment token from another admin (or, for the first
            admin, from the server).
          </p>
          <div className="field">
            <label htmlFor="token">Enrolment token</label>
            <input id="token" name="token" autoComplete="off" spellCheck={false} required />
          </div>
          <button className="button" type="submit" disabled={pending}>
            Set up my authenticator
          </button>
        </>
      ) : null}

      {step.stage === "confirm" ? (
        <>
          <p>
            Add this key to your authenticator app (on a phone, the link opens it), then enter the 6-digit code it shows.
          </p>
          <p className="secret" aria-label="Authenticator key">
            {step.secret}
          </p>
          <p>
            <a href={step.uri}>Open in an authenticator app</a>
          </p>
          <div className="field">
            <label htmlFor="code">
              Code from the app
              <span className="hint">6 digits</span>
            </label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
          </div>
          <button className="button" type="submit" disabled={pending}>
            Confirm and sign in
          </button>
        </>
      ) : null}

      {step.stage === "code" ? (
        <>
          <div className="field">
            <label htmlFor="code">
              Authenticator code
              <span className="hint">6 digits from your app, or one of your recovery codes</span>
            </label>
            <input id="code" name="code" autoComplete="one-time-code" spellCheck={false} required />
          </div>
          <button className="button" type="submit" disabled={pending}>
            Sign in
          </button>
        </>
      ) : null}
    </form>
  );
}
