import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getItems, getProject, inboxAddress } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import { attachDocument, checkMail, deleteDocument, uploadDocument } from "@/lib/actions/documents";
import CopyRow from "@/components/CopyRow";
import TopBar from "@/components/TopBar";
import TripNav from "@/components/TripNav";

interface DocRow {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  source: string;
  from_email: string | null;
  subject: string | null;
  received_at: string;
  item_id: string | null;
}

function human(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mail?: string }>;
}) {
  const { id } = await params;
  const { mail } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const [owner, docs, items] = await Promise.all([
    currentOwner(),
    query<DocRow>(
      "SELECT id, filename, mime_type, size_bytes, source, from_email, subject, received_at, item_id FROM documents WHERE project_id = $1 ORDER BY received_at DESC",
      [id]
    ),
    getItems(id),
  ]);

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{project.name}</div>
      </div>
      <TripNav projectId={id} active="documents" />

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>This trip&apos;s inbox</h2>
        <p className="small muted">
          Forward any booking confirmation to this address and it appears here.
        </p>
        <CopyRow value={inboxAddress(project.inbox_token)} />

        <form action={checkMail} style={{ marginTop: "1rem" }}>
          <input type="hidden" name="project_id" value={id} />
          <button className="btn btn-primary" type="submit">
            Check for new documents
          </button>
        </form>

        {mail === "unconfigured" && (
          <div className="finding finding-unverified" style={{ marginTop: "1rem" }}>
            <span className="dot dot-unverified" />
            <span>
              Mail isn&apos;t set up yet — add GMAIL_USER and GMAIL_APP_PASSWORD. Everything
              else works without it.
            </span>
          </div>
        )}
        {mail === "error" && (
          <div className="finding finding-conflict" style={{ marginTop: "1rem" }}>
            <span className="dot dot-conflict" />
            <span>Couldn&apos;t reach the mailbox. Check the app password.</span>
          </div>
        )}
        {mail && /^\d+$/.test(mail) && (
          <div className="finding finding-match" style={{ marginTop: "1rem" }}>
            <span className="dot dot-match" />
            <span>
              {mail === "0"
                ? "Nothing new for this trip."
                : `${mail} new document${mail === "1" ? "" : "s"} filed.`}
            </span>
          </div>
        )}
      </div>

      <form action={uploadDocument} className="card" style={{ marginBottom: "1.5rem" }}>
        <input type="hidden" name="project_id" value={id} />
        <label htmlFor="file">Or add a file yourself</label>
        <input id="file" name="file" type="file" style={{ marginBottom: "0.75rem" }} />
        <button className="btn" type="submit">
          Upload
        </button>
      </form>

      <h2 style={{ marginBottom: "0.75rem" }}>Documents</h2>
      {docs.length === 0 ? (
        <div className="empty">
          <h3>Nothing here yet</h3>
          <p className="small">Forward a booking confirmation to the address above.</p>
        </div>
      ) : (
        <div className="card">
          {docs.map((doc) => (
            <div className="person" key={doc.id}>
              <div className="avatar">{doc.source === "email" ? "✉" : "↑"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-tight">
                  <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer">
                    <strong>{doc.filename}</strong>
                  </a>
                  <span className="badge badge-quiet">{human(doc.size_bytes)}</span>
                </div>
                <div className="small muted">
                  {doc.subject ? `${doc.subject} · ` : ""}
                  {doc.from_email ? `from ${doc.from_email}` : "uploaded"}
                </div>
                <div className="row-tight" style={{ marginTop: "0.5rem" }}>
                  {!doc.item_id && (
                    <Link className="btn btn-primary btn-sm" href={`/trips/${id}/documents/${doc.id}`}>
                      Read it and add to itinerary
                    </Link>
                  )}
                  <form action={attachDocument} className="row-tight">
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="document_id" value={doc.id} />
                    <select name="item_id" defaultValue={doc.item_id ?? ""} style={{ width: "auto", maxWidth: "16rem" }}>
                      <option value="">Not attached to anything</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {String(item.day).slice(5, 10)} — {item.title}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm" type="submit">
                      Attach
                    </button>
                  </form>
                </div>
              </div>
              <form action={deleteDocument}>
                <input type="hidden" name="project_id" value={id} />
                <input type="hidden" name="document_id" value={doc.id} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
