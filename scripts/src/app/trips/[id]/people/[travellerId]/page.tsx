import { notFound, redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { getHealth, getProject } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import { removeTraveller } from "@/lib/actions/people";
import TravellerForm from "@/components/TravellerForm";
import TopBar from "@/components/TopBar";
import TripNav from "@/components/TripNav";
import type { Requirement, Traveller } from "@/lib/types";

export default async function TravellerPage({
  params,
}: {
  params: Promise<{ id: string; travellerId: string }>;
}) {
  const { id, travellerId } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const traveller = await one<Traveller>(
    "SELECT * FROM travellers WHERE id = $1 AND project_id = $2",
    [travellerId, id]
  );
  if (!traveller) notFound();

  const [owner, requirements, health] = await Promise.all([
    currentOwner(),
    query<Requirement>("SELECT * FROM requirements WHERE traveller_id = $1", [travellerId]),
    getHealth(travellerId),
  ]);

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{traveller.name}</div>
        <div className="sub">{project.name}</div>
      </div>
      <TripNav projectId={id} active="people" />

      <TravellerForm
        projectId={id}
        traveller={traveller}
        requirements={requirements}
        health={health}
      />

      {/* Down here rather than in the list, so nobody removes a person by
          mis-tapping next to their name. */}
      <form
        action={removeTraveller}
        style={{ marginTop: "2.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--line)" }}
      >
        <input type="hidden" name="project_id" value={id} />
        <input type="hidden" name="traveller_id" value={travellerId} />
        <h3 style={{ marginBottom: "0.25rem" }}>Remove {traveller.name} from this trip</h3>
        <p className="small muted" style={{ marginBottom: "0.75rem" }}>
          This also deletes their requirements and health details, and takes them
          off every activity. It can&apos;t be undone.
        </p>
        <button className="btn btn-danger btn-sm" type="submit">
          Remove {traveller.name}
        </button>
      </form>
    </main>
  );
}
