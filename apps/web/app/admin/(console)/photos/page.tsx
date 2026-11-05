import type { Metadata } from "next";

import { api } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { decidePhoto } from "../actions";
import { DONE, first } from "../labels";

export const metadata: Metadata = { title: "Photo review" };

type Pending = { user_id: string; display_name: string | null; photo: { id: string; urls: { small: string; large: string } } };

export default async function Photos({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const { token } = await requireStaff();
  const query = await searchParams;
  const done = first(query.done);
  const error = first(query.error);
  const pending = await api<Pending[]>("/v1/admin/photos/pending", { token });
  return (
    <>
      <h1>Photo review</h1>
      <p className="muted">
        New photos stay hidden from other members until they&apos;re approved. Oldest first. You can&apos;t review your own.
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
      {pending.ok && pending.data.length === 0 ? <p>No photos waiting.</p> : null}
      {pending.ok ? (
        <ul className="photos">
          {pending.data.map((p) => (
            <li key={p.photo.id}>
              <img src={`${API_PUBLIC_URL}${p.photo.urls.small}`} alt={`Photo from ${p.display_name ?? "a member"}`} width={128} height={128} />
              <form action={decidePhoto.bind(null, p.photo.id)} className="inline-form">
                <button className="button secondary" type="submit" name="decision" value="approve" aria-label={`Approve the photo from ${p.display_name ?? "a member"}`}>
                  Approve
                </button>
                <button className="button danger" type="submit" name="decision" value="reject" aria-label={`Reject the photo from ${p.display_name ?? "a member"}`}>
                  Reject
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
