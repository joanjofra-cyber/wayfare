import { notFound, redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { activeRequirementCodes, getProject, getTravellers } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import ItemForm from "@/components/ItemForm";
import TopBar from "@/components/TopBar";
import type { Item, ItemAttributes } from "@/lib/types";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const item = await one<Item>("SELECT * FROM items WHERE id = $1 AND project_id = $2", [itemId, id]);
  if (!item) notFound();

  const [owner, travellers, activeCodes, attrs, parts] = await Promise.all([
    currentOwner(),
    getTravellers(id),
    activeRequirementCodes(id),
    one<ItemAttributes>("SELECT * FROM item_attributes WHERE item_id = $1", [itemId]),
    query<{ traveller_id: string }>("SELECT traveller_id FROM item_participants WHERE item_id = $1", [itemId]),
  ]);

  return (
    <main className="shell-narrow">
      <TopBar ownerName={owner?.name} />
      <h1 style={{ marginBottom: "1.5rem" }}>Edit</h1>
      <ItemForm
        projectId={id}
        travellers={travellers}
        activeCodes={activeCodes}
        item={{ ...item, day: String(item.day).slice(0, 10) }}
        attrs={attrs}
        participantIds={parts.map((p) => p.traveller_id)}
      />
    </main>
  );
}
