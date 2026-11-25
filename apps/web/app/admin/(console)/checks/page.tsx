import type { Metadata } from "next";

import { api } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { decideCheck } from "../actions";
import { CHECK_REASONS, DONE, first, GESTURES, when } from "../labels";

export const metadata: Metadata = { title: "Photo checks" };

/** A selfie waiting for review, beside every photo of the member's (D164). The API audits each view. */
type Check = {
  id: string;
  display_name: string | null;
  gesture: string;
  submitted_at: string;
  selfie: { small: string; large: string };
  photos: { id: string; moderation_state: string; urls: { small: string; large: string } }[];
};

/**
 * The blue tick (stage 29b, D164): members who ask for it send a selfie making a gesture the server
 * chose. Staff compare it by eye with the member's photos and approve, or reject with why; the API
 * deletes the selfie either way, and never lets staff decide their own.
 */
export default async function Checks({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const { token } = await requireStaff();
  const query = await searchParams;
  const done = first(query.done);
  const error = first(query.error);
  const pending = await api<Check[]>("/v1/admin/photo-checks/pending", { token });
  return (
    <>
      <h1>Photo checks</h1>
      <p className="muted">
        Members who asked for the blue tick sent a selfie making a gesture we chose. Approve only when it&apos;s
        clearly the person in every photo, making that gesture: the tick tells others we checked. The selfie is deleted
        as soon as you decide. You can&apos;t check your own. Oldest first.
      </p>
      {done ? (
        <p className="notice success" role="status">
          {DONE[done] ?? "Done."}
        </p>
      ) : null}
      {error || !pending.ok ? (
        <p className="notice error" role="alert">
          {messageFor(error ?? (pending.ok ? "error" : pending.code))}
        </p>
      ) : null}
      {pending.ok && pending.data.length === 0 ? <p>No selfies waiting.</p> : null}
      {pending.ok
        ? pending.data.map((c) => {
            const name = c.display_name ?? "A member";
            return (
              <section key={c.id} className="check" aria-labelledby={`check-${c.id}`}>
                <h2 id={`check-${c.id}`}>{name}</h2>
                <p>
                  Asked for: <strong>{GESTURES[c.gesture] ?? c.gesture}</strong>. Sent {when(c.submitted_at)}.
                </p>
                <div className="check-images">
                  <figure className="selfie">
                    <img src={`${API_PUBLIC_URL}${c.selfie.large}`} alt={`Selfie from ${name}`} width={256} height={320} />
                    <figcaption>The selfie</figcaption>
                  </figure>
                  <ul className="photos" aria-label={`Photos of ${name}`}>
                    {c.photos.map((p, i) => (
                      <li key={p.id}>
                        <img
                          src={`${API_PUBLIC_URL}${p.urls.small}`}
                          alt={`Photo ${i + 1} of ${name}${p.moderation_state === "approved" ? "" : ", not reviewed yet"}`}
                          width={128}
                          height={128}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <form action={decideCheck.bind(null, c.id)} className="inline-form">
                  <button
                    className="button secondary"
                    type="submit"
                    name="decision"
                    value="approve"
                    aria-label={`Approve the photo check of ${name}`}
                  >
                    Approve
                  </button>
                  <div className="field">
                    <label htmlFor={`reason-${c.id}`}>If rejecting, why</label>
                    <select id={`reason-${c.id}`} name="reason" defaultValue="face_mismatch">
                      {Object.entries(CHECK_REASONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="button danger"
                    type="submit"
                    name="decision"
                    value="reject"
                    aria-label={`Reject the photo check of ${name}`}
                  >
                    Reject
                  </button>
                </form>
              </section>
            );
          })
        : null}
    </>
  );
}
