"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { canEdit, currentActor } from "@/lib/session";
import type { Item, Project } from "@/lib/types";

async function loadProject(id: string): Promise<Project> {
  const project = await one<Project>("SELECT * FROM projects WHERE id = $1", [id]);
  if (!project) redirect("/trips");
  return project;
}

async function logChange(
  projectId: string,
  itemId: string | null,
  action: "created" | "updated" | "deleted",
  summary: string,
  project: Project
) {
  const actor = await currentActor(project);
  await query(
    "INSERT INTO changes (project_id, item_id, actor_name, action, summary) VALUES ($1,$2,$3,$4,$5)",
    [projectId, itemId, actor?.name ?? null, action, summary]
  );
}

/** Form values arrive as 'yes' | 'no' | 'unknown'; the column is a boolean. */
function triToBool(v: FormDataEntryValue | null): boolean | null {
  const s = String(v ?? "unknown");
  if (s === "yes") return true;
  if (s === "no") return false;
  return null;
}

function tri(v: FormDataEntryValue | null): "yes" | "no" | "unknown" {
  const s = String(v ?? "unknown");
  return s === "yes" || s === "no" ? s : "unknown";
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s || !/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

async function saveAttributes(itemId: string, formData: FormData) {
  await query(
    `INSERT INTO item_attributes (
       item_id, walking_minutes, wheelchair_accessible, has_stairs, has_lift, terrain,
       seating_available, child_seat_available, cot_available, min_age,
       gluten_free_options, vegetarian_options, vegan_options, outdoor, crowded, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (item_id) DO UPDATE SET
       walking_minutes = EXCLUDED.walking_minutes,
       wheelchair_accessible = EXCLUDED.wheelchair_accessible,
       has_stairs = EXCLUDED.has_stairs,
       has_lift = EXCLUDED.has_lift,
       terrain = EXCLUDED.terrain,
       seating_available = EXCLUDED.seating_available,
       child_seat_available = EXCLUDED.child_seat_available,
       cot_available = EXCLUDED.cot_available,
       min_age = EXCLUDED.min_age,
       gluten_free_options = EXCLUDED.gluten_free_options,
       vegetarian_options = EXCLUDED.vegetarian_options,
       vegan_options = EXCLUDED.vegan_options,
       outdoor = EXCLUDED.outdoor,
       crowded = EXCLUDED.crowded,
       tags = EXCLUDED.tags`,
    [
      itemId,
      intOrNull(formData.get("attr_walking_minutes")),
      tri(formData.get("attr_wheelchair_accessible")),
      triToBool(formData.get("attr_has_stairs")),
      triToBool(formData.get("attr_has_lift")),
      String(formData.get("attr_terrain") ?? "") || null,
      tri(formData.get("attr_seating_available")),
      tri(formData.get("attr_child_seat_available")),
      tri(formData.get("attr_cot_available")),
      intOrNull(formData.get("attr_min_age")),
      tri(formData.get("attr_gluten_free_options")),
      tri(formData.get("attr_vegetarian_options")),
      tri(formData.get("attr_vegan_options")),
      triToBool(formData.get("attr_outdoor")),
      triToBool(formData.get("attr_crowded")),
      formData.getAll("tags").map(String),
    ]
  );
}

/**
 * No participant rows means everybody is going. So when every traveller is
 * ticked we store nothing at all — that way adding a new person to the trip
 * later automatically includes them, instead of silently leaving them out of
 * everything planned before they arrived.
 */
async function saveParticipants(itemId: string, projectId: string, formData: FormData) {
  const chosen = formData.getAll("participants").map(String);
  await query("DELETE FROM item_participants WHERE item_id = $1", [itemId]);
  if (chosen.length === 0) return;

  const all = await query<{ id: string }>("SELECT id FROM travellers WHERE project_id = $1", [projectId]);
  if (chosen.length === all.length) return; // everybody -> store nothing

  for (const travellerId of chosen) {
    await query(
      "INSERT INTO item_participants (item_id, traveller_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [itemId, travellerId]
    );
  }
}

/** Text field, trimmed, empty string becomes null. Upper-cased for codes. */
function field(formData: FormData, key: string, upper = false): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return upper ? value.toUpperCase() : value;
}

/** The columns shared by createItem and updateItem, in a fixed order. */
function itemColumns(formData: FormData) {
  const costRaw = String(formData.get("cost") ?? "").trim();
  return [
    field(formData, "starts_at"),
    field(formData, "ends_at"),
    String(formData.get("kind") ?? "activity"),
    field(formData, "location_name"),
    field(formData, "address"),
    field(formData, "url"),
    field(formData, "notes"),
    costRaw ? Number(costRaw) : null,
    field(formData, "booking_ref", true),
    field(formData, "mode"),
    field(formData, "carrier"),
    field(formData, "service_number", true),
    field(formData, "origin"),
    field(formData, "origin_code", true),
    field(formData, "destination"),
    field(formData, "destination_code", true),
    field(formData, "terminal"),
    field(formData, "ends_day"),
  ];
}

export async function createItem(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const title = String(formData.get("title") ?? "").trim();
  const day = String(formData.get("day") ?? "").trim();
  if (!title || !day) return;

  const item = await one<{ id: string }>(
    `INSERT INTO items (project_id, day, title,
                        starts_at, ends_at, kind, location_name, address, url,
                        notes, cost, booking_ref, mode, carrier, service_number,
                        origin, origin_code, destination, destination_code,
                        terminal, ends_day)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    [projectId, day, title, ...itemColumns(formData)]
  );
  if (!item) return;

  await saveAttributes(item.id, formData);
  await saveParticipants(item.id, projectId, formData);

  // A document that produced this entry gets filed against it, so the ticket
  // and the thing it is a ticket for stay together.
  const documentId = String(formData.get("document_id") ?? "").trim();
  if (documentId) {
    await query("UPDATE documents SET item_id = $1 WHERE id = $2 AND project_id = $3", [
      item.id,
      documentId,
      projectId,
    ]);
  }

  await logChange(projectId, item.id, "created", `Added “${title}”`, project);

  revalidatePath(`/trips/${projectId}`);
  redirect(`/trips/${projectId}#item-${item.id}`);
}

export async function updateItem(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const itemId = String(formData.get("item_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const before = await one<Item>("SELECT * FROM items WHERE id = $1 AND project_id = $2", [
    itemId,
    projectId,
  ]);
  if (!before) return;

  const title = String(formData.get("title") ?? "").trim() || before.title;
  const day = String(formData.get("day") ?? "").trim() || before.day;
  const startsAt = String(formData.get("starts_at") ?? "").trim() || null;

  await query(
    `UPDATE items SET day=$3, title=$4,
            starts_at=$5, ends_at=$6, kind=$7, location_name=$8, address=$9,
            url=$10, notes=$11, cost=$12, booking_ref=$13, mode=$14, carrier=$15,
            service_number=$16, origin=$17, origin_code=$18, destination=$19,
            destination_code=$20, terminal=$21, ends_day=$22, updated_at=now()
      WHERE id=$1 AND project_id=$2`,
    [itemId, projectId, day, title, ...itemColumns(formData)]
  );

  await saveAttributes(itemId, formData);
  await saveParticipants(itemId, projectId, formData);

  // A change log is only useful if it says what actually changed.
  const parts: string[] = [];
  if (before.title !== title) parts.push(`renamed to “${title}”`);
  if (before.day !== day) parts.push(`moved to ${day}`);
  const beforeTime = before.starts_at?.slice(0, 5) ?? null;
  const afterTime = startsAt?.slice(0, 5) ?? null;
  if (beforeTime !== afterTime) {
    parts.push(afterTime ? `moved to ${afterTime}` : "time removed");
  }
  const summary = parts.length
    ? `“${before.title}” ${parts.join(", ")}`
    : `Updated “${title}”`;

  await logChange(projectId, itemId, "updated", summary, project);
  revalidatePath(`/trips/${projectId}`);
  redirect(`/trips/${projectId}#item-${itemId}`);
}

export async function deleteItem(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const itemId = String(formData.get("item_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const item = await one<Item>("SELECT * FROM items WHERE id = $1 AND project_id = $2", [
    itemId,
    projectId,
  ]);
  if (!item) return;

  await query("DELETE FROM items WHERE id = $1 AND project_id = $2", [itemId, projectId]);
  await logChange(projectId, null, "deleted", `Removed “${item.title}”`, project);

  revalidatePath(`/trips/${projectId}`);
  redirect(`/trips/${projectId}`);
}

/**
 * Applies the fix the app already worked out — currently only used by the age
 * rule, which knows both the problem and the answer.
 */
export async function removeParticipants(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const itemId = String(formData.get("item_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const remove = new Set(formData.getAll("traveller_ids").map(String));
  const all = await query<{ id: string; name: string }>(
    "SELECT id, name FROM travellers WHERE project_id = $1 ORDER BY created_at",
    [projectId]
  );
  const existing = await query<{ traveller_id: string }>(
    "SELECT traveller_id FROM item_participants WHERE item_id = $1",
    [itemId]
  );

  // An item with no participant rows currently means "everybody", so the
  // remaining people have to be written out explicitly.
  const current =
    existing.length > 0 ? existing.map((r) => r.traveller_id) : all.map((t) => t.id);
  const remaining = current.filter((id) => !remove.has(id));

  await query("DELETE FROM item_participants WHERE item_id = $1", [itemId]);
  for (const travellerId of remaining) {
    await query("INSERT INTO item_participants (item_id, traveller_id) VALUES ($1,$2)", [
      itemId,
      travellerId,
    ]);
  }

  const removedNames = all.filter((t) => remove.has(t.id)).map((t) => t.name).join(" and ");
  const item = await one<{ title: string }>("SELECT title FROM items WHERE id = $1", [itemId]);
  await logChange(
    projectId,
    itemId,
    "updated",
    `${removedNames} no longer joining “${item?.title ?? "activity"}”`,
    project
  );

  revalidatePath(`/trips/${projectId}`);
  redirect(`/trips/${projectId}#item-${itemId}`);
}
