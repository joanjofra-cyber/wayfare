import { notFound, redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { getHealth, getProject } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
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
    </main>
  );
}
