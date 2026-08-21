"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { canEdit, currentOwner, randomToken, setGuestIdentity } from "@/lib/session";
import type { Project } from "@/lib/types";

async function requireOwner() {
  const owner = await currentOwner();
  if (!owner) redirect("/");
  return owner;
}

async function loadProject(id: string): Promise<Project> {
  const project = await one<Project>("SELECT * FROM projects WHERE id = $1", [id]);
  if (!project) redirect("/trips");
  return project;
}

export async function createTrip(formData: FormData) {
  const owner = await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  const imGoing = formData.get("im_going") === "on";
  if (!name) return;

  const project = await one<{ id: string }>(
    `INSERT INTO projects (owner_id, name, share_token, inbox_token)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [owner.id, name, randomToken(10), randomToken(7)]
  );
  if (!project) return;

  // The organiser is usually also a traveller — but not if an agency is
  // planning a trip it is not going on, which is why this is a checkbox.
  if (imGoing) {
    await query(
      "INSERT INTO travellers (project_id, owner_id, name) VALUES ($1, $2, $3)",
      [project.id, owner.id, owner.name]
    );
  }

  redirect(`/trips/${project.id}/people?welcome=1`);
}

export async function updateTripSettings(formData: FormData) {
  const id = String(formData.get("project_id"));
  const project = await loadProject(id);
  if (!(await canEdit(project))) return;

  await query(
    `UPDATE projects
        SET name = $2, destination = $3, start_date = $4, end_date = $5,
            timezone = $6, currency = $7, link_can_edit = $8
      WHERE id = $1`,
    [
      id,
      String(formData.get("name") ?? project.name).trim() || project.name,
      String(formData.get("destination") ?? "").trim() || null,
      String(formData.get("start_date") ?? "").trim() || null,
      String(formData.get("end_date") ?? "").trim() || null,
      String(formData.get("timezone") ?? project.timezone) || project.timezone,
      String(formData.get("currency") ?? project.currency) || project.currency,
      formData.get("link_can_edit") === "on",
    ]
  );

  revalidatePath(`/trips/${id}`);
  redirect(`/trips/${id}/settings?saved=1`);
}

export async function regenerateShareLink(formData: FormData) {
  const id = String(formData.get("project_id"));
  const owner = await requireOwner();
  const project = await loadProject(id);
  if (project.owner_id !== owner.id) return;

  await query("UPDATE projects SET share_token = $2, share_revoked_at = now() WHERE id = $1", [
    id,
    randomToken(10),
  ]);
  revalidatePath(`/trips/${id}/settings`);
  redirect(`/trips/${id}/settings?regenerated=1`);
}

/** The "which of these people are you?" answer from a share-link visitor. */
export async function chooseIdentity(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const token = String(formData.get("token"));
  let travellerId = String(formData.get("traveller_id") ?? "");
  const newName = String(formData.get("new_name") ?? "").trim();

  if (travellerId === "__new__" && newName) {
    const created = await one<{ id: string }>(
      "INSERT INTO travellers (project_id, name) VALUES ($1, $2) RETURNING id",
      [projectId, newName]
    );
    travellerId = created?.id ?? "";
  }

  if (travellerId) await setGuestIdentity(projectId, travellerId);
  // Straight to the itinerary, not back through the share-link route handler:
  // bouncing an action's redirect through a second redirect leaves the browser
  // sitting on the intermediate URL.
  redirect(`/t/${token}/view`);
}
