import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { one } from "@/lib/db";
import { extractBooking } from "@/lib/extract";
import { documentText } from "@/lib/pdf";
import { activeRequirementCodes, getProject, getTravellers, todayInTrip } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import ItemForm from "@/components/ItemForm";
import TopBar from "@/components/TopBar";

interface DocRow {
  id: string;
  filename: string;
  mime_type: string | null;
  subject: string | null;
  from_email: string | null;
  content: Buffer;
}

/**
 * "We read this out of the document — is it right?"
 *
 * Nothing here is saved until the organiser presses the button. The evidence
 * column exists so checking is a two-second glance rather than an act of faith,
 * and what could not be found is listed plainly instead of being left as an
 * empty field the reader might not notice.
 */
export default async function ReviewDocumentPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const doc = await one<DocRow>(
    "SELECT id, filename, mime_type, subject, from_email, content FROM documents WHERE id = $1 AND project_id = $2",
    [docId, id]
  );
  if (!doc) notFound();

  const [owner, travellers, activeCodes] = await Promise.all([
    currentOwner(),
    getTravellers(id),
    activeRequirementCodes(id),
  ]);

  const text = await documentText(doc.content, doc.mime_type);
  const yearHint = parseInt((project.start_date ?? todayInTrip(project.timezone)).slice(0, 4), 10);
  const extraction = extractBooking(text, { subject: doc.subject ?? doc.filename, yearHint });

  // Only call it unreadable when there was nothing to read AND nothing was
  // found — a subject line alone can still yield a usable draft, and saying
  // "no readable text" over a filled-in form would just be confusing.
  const unreadable = text.trim().length < 20 && extraction.found.length === 0;

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{doc.subject ?? doc.filename}</div>
        <div className="sub">
          {doc.from_email ? `Forwarded by ${doc.from_email}` : "Uploaded"} · {doc.filename}
        </div>
      </div>

      {unreadable ? (
        <div className="finding finding-unverified" style={{ marginBottom: "1.5rem" }}>
          <span className="dot dot-unverified" />
          <span>
            There&apos;s no readable text in this document — it&apos;s probably a scan or a
            photo. Fill the form in yourself and the file stays attached to it.
          </span>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <h2 style={{ flex: 1, margin: 0 }}>What we read</h2>
            <span className={`badge badge-${extraction.confidence === "high" ? "match" : extraction.confidence === "medium" ? "unverified" : "quiet"}`}>
              {extraction.confidence} confidence
            </span>
          </div>

          {extraction.found.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Nothing recognisable. The form below is empty — fill it in and the
              document stays attached.
            </p>
          ) : (
            <div className="scroll-x">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <tbody>
                  {extraction.found.map((f) => (
                    <tr key={f.field + f.value} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "0.5rem 0.75rem 0.5rem 0", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {f.label}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem 0.5rem 0", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {f.value}
                      </td>
                      <td style={{ padding: "0.5rem 0", color: "var(--ink-3)", fontSize: "0.82rem" }}>
                        <code style={{ fontFamily: "var(--mono)" }}>{f.evidence}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {extraction.missing.length > 0 && (
            <p className="field-hint" style={{ marginTop: "0.75rem" }}>
              Couldn&apos;t find: {extraction.missing.join(", ")}. Everything below is
              editable — nothing is saved until you press the button.
            </p>
          )}

          <p className="tiny muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            <Link href={`/api/documents/${doc.id}`} target="_blank">
              Open the original
            </Link>{" "}
            to check anything that looks off.
          </p>
        </div>
      )}

      <h2 style={{ marginBottom: "1rem" }}>Add it to the itinerary</h2>
      <ItemForm
        projectId={id}
        travellers={travellers}
        activeCodes={activeCodes}
        draft={extraction.draft}
        documentId={doc.id}
        defaultDay={project.start_date?.slice(0, 10) ?? todayInTrip(project.timezone)}
      />
    </main>
  );
}
