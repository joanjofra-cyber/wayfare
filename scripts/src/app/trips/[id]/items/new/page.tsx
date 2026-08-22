import { notFound, redirect } from "next/navigation";
import { activeRequirementCodes, getProject, getTravellers, todayInTrip } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import ItemForm from "@/components/ItemForm";
import TopBar from "@/components/TopBar";

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { id } = await params;
  const { day } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const [owner, travellers, activeCodes] = await Promise.all([
    currentOwner(),
    getTravellers(id),
    activeRequirementCodes(id),
  ]);

  return (
    <main className="shell-narrow">
      <TopBar ownerName={owner?.name} />
      <h1 style={{ marginBottom: "1.5rem" }}>Add to {project.name}</h1>
      <ItemForm
        projectId={id}
        travellers={travellers}
        activeCodes={activeCodes}
        defaultDay={day ?? project.start_date?.slice(0, 10) ?? todayInTrip(project.timezone)}
      />
    </main>
  );
}
