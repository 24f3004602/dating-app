import type { Metadata } from "next";
import Link from "next/link";

import { api } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { messageFor } from "@/lib/messages";
import { requireStaff } from "@/lib/session";

import { actOnAccount, actOnReport } from "../../actions";
import { ACCOUNT, DONE, first, REASONS, STATUS, when } from "../../labels";

export const metadata: Metadata = { title: "Report" };

type Photo = { id: string; moderation_state: string; urls: { small: string; large: string } };
type Detail = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  priority: number;
  created_at: string;
  reporter_id: string | null;
  evidence_text: string | null;
  message_removed: boolean;
  photo: Photo | null;
  subject: {
    user_id: string;
    display_name: string | null;
    age: number;
    account_status: string;
    joined: string;
    bio: string | null;
    prompts: { key: string; text: string; answer: string }[];
    photos: Photo[];
    reports_on_subject: number;
  } | null;
  history: { id: string; action: string; note: string | null; created_at: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { staff, token } = await requireStaff();
  const { id } = await params;
  const query = await searchParams;
  const done = first(query.done);
  const error = first(query.error);
  const found = UUID.test(id) ? await api<Detail>(`/v1/admin/reports/${id}`, { token }) : null;
  if (!found?.ok) {
    return (
      <>
        <h1>Report</h1>
        <p className="notice error" role="alert">
          {messageFor(found?.code ?? "not_found")}
        </p>
        <Link href="/admin">Back to reports</Link>
      </>
    );
  }
  const r = found.data;
  const open = r.status === "open" || r.status === "in_review";
  const photoUrl = (p: Photo) => `${API_PUBLIC_URL}${p.urls.small}`;

  return (
    <>
      <p>
        <Link href="/admin">Back to reports</Link>
      </p>
      <h1>{REASONS[r.reason] ?? r.reason}</h1>
      {done ? (
        <p className="notice success" role="status">
          {DONE[done] ?? "Done."}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error === "note_required" ? "Account actions need a note saying why." : messageFor(error)}
        </p>
      ) : null}
      <p>
        <span className="badge">{STATUS[r.status] ?? r.status}</span> Received {when(r.created_at)}. Reporter:{" "}
        {r.reporter_id ? <code>{r.reporter_id.slice(0, 8)}</code> : "no longer linked"}.
      </p>
      {r.details ? (
        <>
          <h2>What the reporter wrote</h2>
          <p>{r.details}</p>
        </>
      ) : null}
      {r.evidence_text !== null ? (
        <>
          <h2>The reported message</h2>
          <blockquote className="secret">{r.evidence_text}</blockquote>
          {r.message_removed ? <p className="caption">Already removed from the conversation.</p> : null}
        </>
      ) : null}
      {r.photo ? (
        <>
          <h2>The reported photo</h2>
          <img src={photoUrl(r.photo)} alt="The reported photo" width={128} height={128} />
        </>
      ) : null}

      <h2>The account</h2>
      {r.subject ? (
        <>
          <p>
            {r.subject.display_name ?? "No profile"}, {r.subject.age}. {ACCOUNT[r.subject.account_status] ?? r.subject.account_status}.
            Joined {r.subject.joined}. Reports about this account: {r.subject.reports_on_subject}.
          </p>
          {r.subject.bio ? <p>{r.subject.bio}</p> : null}
          {r.subject.prompts.map((p) => (
            <p key={p.key}>
              <strong>{p.text}</strong> {p.answer}
            </p>
          ))}
          <ul className="photos" aria-label="Their photos">
            {r.subject.photos.map((p, i) => (
              <li key={p.id}>
                <img src={photoUrl(p)} alt={`Photo ${i + 1} (${p.moderation_state})`} width={128} height={128} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>The account has been deleted. The report stays for the record.</p>
      )}

      {r.history.length > 0 ? (
        <>
          <h2>Earlier actions on this account</h2>
          <ul>
            {r.history.map((h) => (
              <li key={h.id}>
                {DONE[h.action] ?? h.action} {when(h.created_at)}
                {h.note ? `: ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {open ? (
        <>
          <h2>Resolve this report</h2>
          <form action={actOnReport.bind(null, r.id)}>
            <div className="field">
              <label htmlFor="action">Action</label>
              <select id="action" name="action" defaultValue="dismiss">
                <option value="dismiss">Dismiss: no action needed</option>
                <option value="warn">Warn the account</option>
                {r.photo ? <option value="remove_photo">Remove the photo</option> : null}
                {r.evidence_text !== null ? <option value="remove_message">Remove the message</option> : null}
                <option value="suspend">Suspend the account</option>
                {staff.role === "admin" ? <option value="ban">Ban the account</option> : null}
              </select>
            </div>
            <div className="field">
              <label htmlFor="note">
                Note for other staff
                <span className="hint">Why, in a sentence. No personal details.</span>
              </label>
              <textarea id="note" name="note" maxLength={500} />
            </div>
            <button className="button" type="submit">
              Resolve
            </button>
          </form>
        </>
      ) : null}

      {r.subject && staff.role === "admin" && (r.subject.account_status === "suspended" || r.subject.account_status === "banned") ? (
        <>
          <h2>Reinstate the account</h2>
          <form action={actOnAccount.bind(null, r.subject.user_id, r.id)}>
            <input type="hidden" name="action" value="reinstate" />
            <div className="field">
              <label htmlFor="reinstate-note">Why</label>
              <textarea id="reinstate-note" name="note" maxLength={500} required />
            </div>
            <button className="button secondary" type="submit">
              Reinstate
            </button>
          </form>
        </>
      ) : null}
    </>
  );
}
