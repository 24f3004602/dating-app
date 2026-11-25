"use client";

import { useActionState } from "react";

import { messageFor } from "@/lib/messages";

import { type MemberSearch as Search, rejectFoundPhoto, searchMembers, suspendFoundMember } from "../actions";
import { ACCOUNT } from "../labels";

/**
 * Find the member a complaint by email is about (D158), then act as on a report. What was searched
 * for stays in this form: it goes to the API in a POST body and is never put in a URL.
 */
export function MemberSearch() {
  const [state, act, pending] = useActionState<Search, FormData>(searchMembers, {});
  return (
    <>
      <form action={act}>
        <div className="field">
          <label htmlFor="email">
            Their email address
            <span className="hint">The address their account uses, if the complaint gives it.</span>
          </label>
          <input id="email" name="email" type="email" autoComplete="off" />
        </div>
        <p className="caption">Or, as their profile shows them:</p>
        <div className="field">
          <label htmlFor="name">First name</label>
          <input id="name" name="name" autoComplete="off" maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="age">Age</label>
          <input id="age" name="age" type="number" inputMode="numeric" min={18} max={120} />
        </div>
        <button className="button" type="submit" disabled={pending}>
          Find
        </button>
      </form>
      {state.error ? (
        <p className="notice error" role="alert">
          {messageFor(state.error)}
        </p>
      ) : null}
      {state.results && state.results.length === 0 ? <p role="status">No member found.</p> : null}
      {state.results && state.results.length > 0 ? (
        <section aria-label="Members found">
          <p role="status">{state.results.length === 1 ? "1 member found." : `${state.results.length} members found.`}</p>
          {state.results.map((m) => {
            const name = m.display_name ?? "A member without a profile";
            return (
              <article key={m.user_id}>
                <h2>
                  {name}, {m.age}
                </h2>
                <p className="caption">
                  {ACCOUNT[m.account_status] ?? m.account_status} · joined {m.joined} · reports about them:{" "}
                  {m.reports_on_subject}
                </p>
                <ul className="photos" aria-label={`Photos of ${name}`}>
                  {m.photos.map((p, i) => (
                    <li key={p.id}>
                      <img src={p.src} alt={`Photo ${i + 1} of ${name} (${p.moderation_state})`} width={128} height={128} />
                      {p.moderation_state === "rejected" ? (
                        <p className="caption">Rejected</p>
                      ) : (
                        <form action={rejectFoundPhoto.bind(null, p.id)}>
                          <button className="button danger" type="submit" aria-label={`Reject photo ${i + 1} of ${name}`}>
                            Reject
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                {m.account_status === "active" ? (
                  <form action={suspendFoundMember.bind(null, m.user_id)}>
                    <div className="field">
                      <label htmlFor={`note-${m.user_id}`}>
                        Note for other staff
                        <span className="hint">Why, in a sentence: the complaint, not the complainant.</span>
                      </label>
                      <textarea id={`note-${m.user_id}`} name="note" maxLength={500} required />
                    </div>
                    <button className="button danger" type="submit" aria-label={`Suspend the account of ${name}`}>
                      Suspend the account
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
