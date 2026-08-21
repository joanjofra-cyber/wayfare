import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject, getRequirements, getTravellers, inboxAddress, shareUrl } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import { PRESET_BY_CODE } from "@/lib/presets";
import { addTravellers } from "@/lib/actions/people";
import TopBar from "@/components/TopBar";
import TripNav from "@/components/TripNav";
import CopyRow from "@/components/CopyRow";

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { welcome } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const [owner, travellers, requirements] = await Promise.all([
    currentOwner(),
    getTravellers(id),
    getRequirements(id),
  ]);

  const byTraveller = new Map<string, string[]>();
  for (const req of requirements) {
    if (!req.traveller_id) continue;
    const label =
      PRESET_BY_CODE[req.code]?.label ??
      req.code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    if (req.level !== "mandatory") continue;
    const list = byTraveller.get(req.traveller_id) ?? [];
    list.push(label);
    byTraveller.set(req.traveller_id, list);
  }

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{project.name}</div>
      </div>
      <TripNav projectId={id} active="people" />

      {welcome && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Your trip is ready</h2>
          <p className="small muted">
            Two things worth keeping. Send the first to your group; forward booking
            confirmations to the second.
          </p>
          <div className="stack-sm" style={{ marginTop: "1rem" }}>
            <div>
              <label>Share link</label>
              <CopyRow value={shareUrl(project.share_token)} />
            </div>
            <div>
              <label>Documents inbox</label>
              <CopyRow value={inboxAddress(project.inbox_token)} />
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 0 }}>
        <h2>Who&apos;s coming</h2>
        <p className="section-hint">
          Adding names now is what turns everyone else&apos;s arrival into a single tap
          instead of a form.
        </p>

        {travellers.length > 0 && (
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            {travellers.map((t) => {
              const needs = byTraveller.get(t.id) ?? [];
              return (
                <div className="person" key={t.id}>
                  <div className="avatar">{t.name.slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-tight">
                      <strong>{t.name}</strong>
                      {t.owner_id && <span className="badge badge-quiet">organiser</span>}
                      {t.age != null && <span className="small muted">{t.age}</span>}
                      {!t.share_needs && (
                        <span className="badge badge-quiet">needs kept private</span>
                      )}
                    </div>
                    <div className="small muted">
                      {needs.length > 0
                        ? needs.join(" · ")
                        : t.profile_completed_at
                          ? "No specific requirements"
                          : "Nothing filled in yet"}
                    </div>
                  </div>
                  <Link className="btn btn-sm" href={`/trips/${id}/people/${t.id}`}>
                    {t.profile_completed_at ? "Edit" : "Fill in"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <form action={addTravellers} className="card">
          <input type="hidden" name="project_id" value={id} />
          <label htmlFor="names">Add people</label>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
            One name per line. Just names for now — everyone can fill in their own
            details from the share link.
          </p>
          <textarea
            id="names"
            name="names"
            rows={4}
            placeholder={"Marta\nGrandad\nLeo"}
            style={{ marginBottom: "0.75rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
        <p className="tiny muted" style={{ marginTop: "0.5rem" }}>
          Names entered here are split by line.
        </p>
      </div>
    </main>
  );
}
