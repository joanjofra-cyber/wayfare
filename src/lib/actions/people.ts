"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { canEdit, currentOwner } from "@/lib/session";
import { INTERESTS, PRESETS, PRESET_BY_CODE, STYLES } from "@/lib/presets";
import type { Project } from "@/lib/types";

async function loadProject(id: string): Promise<Project> {
  const project = await one<Project>("SELECT * FROM projects WHERE id = $1", [id]);
  if (!project) redirect("/trips");
  return project;
}

export async function addTravellers(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  // One name per line, and tolerant of commas because people will use them.
  const names = String(formData.get("names") ?? "")
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 40);

  for (const name of names) {
    await query("INSERT INTO travellers (project_id, name) VALUES ($1, $2)", [projectId, name]);
  }

  revalidatePath(`/trips/${projectId}/people`);
  redirect(`/trips/${projectId}/people`);
}

export async function removeTraveller(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const travellerId = String(formData.get("traveller_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  await query("DELETE FROM travellers WHERE id = $1 AND project_id = $2", [travellerId, projectId]);
  revalidatePath(`/trips/${projectId}/people`);
  redirect(`/trips/${projectId}/people`);
}

/**
 * Saves one traveller's profile, requirements and health details in one go.
 *
 * Requirements are replaced wholesale rather than diffed: the form always
 * shows the complete picture, so whatever it submits is the truth. Simpler,
 * and impossible to leave a stale row behind.
 */
export async function saveTraveller(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const travellerId = String(formData.get("traveller_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const traveller = await one<{ id: string }>(
    "SELECT id FROM travellers WHERE id = $1 AND project_id = $2",
    [travellerId, projectId]
  );
  if (!traveller) return;

  const text = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v || null;
  };
  const ageRaw = text("age");
  const age = ageRaw && /^\d+$/.test(ageRaw) ? parseInt(ageRaw, 10) : null;

  await query(
    `UPDATE travellers
        SET name = COALESCE($2, name), age = $3, phone = $4, email = $5, country = $6,
            language = $7, currency = $8, timezone = $9,
            travels_with = $10, priorities = $11,
            health_disclosure = $12, share_needs = $13,
            profile_completed_at = now()
      WHERE id = $1`,
    [
      travellerId,
      text("name"),
      age,
      text("phone"),
      text("email"),
      text("country"),
      text("language"),
      text("currency"),
      text("timezone"),
      formData.getAll("travels_with").map(String),
      formData.getAll("priorities").map(String),
      text("health_disclosure"),
      formData.get("share_needs") === "on",
    ]
  );

  // ---- requirements ------------------------------------------------------
  await query("DELETE FROM requirements WHERE traveller_id = $1", [travellerId]);

  for (const preset of PRESETS) {
    if (formData.get(`req_${preset.code}`) !== "on") continue;

    const allowed = preset.allowedLevels ?? ["mandatory", "preferred"];
    const submitted = String(formData.get(`level_${preset.code}`) ?? preset.defaultLevel);
    const level = allowed.includes(submitted as "mandatory" | "preferred")
      ? submitted
      : preset.defaultLevel;

    const value: Record<string, unknown> = {};
    if (preset.field) {
      const raw = String(formData.get(`val_${preset.code}_${preset.field.key}`) ?? "").trim();
      if (raw) {
        value[preset.field.key] = preset.field.type === "number" ? Number(raw) : raw;
      } else if (preset.field.default !== undefined) {
        value[preset.field.key] = preset.field.default;
      }
    }

    await query(
      `INSERT INTO requirements (project_id, traveller_id, level, category, code, value, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId,
        travellerId,
        level,
        preset.category,
        preset.code,
        JSON.stringify(value),
        text(`note_${preset.code}`),
      ]
    );
  }

  // Interests and travel styles are always preferred — they rank suggestions,
  // they never block anything.
  for (const interest of INTERESTS) {
    if (formData.get(`interest_${interest.code}`) !== "on") continue;
    await query(
      `INSERT INTO requirements (project_id, traveller_id, level, category, code, value)
       VALUES ($1, $2, 'preferred', 'interest', $3, '{}'::jsonb)`,
      [projectId, travellerId, interest.code]
    );
  }
  for (const style of STYLES) {
    if (formData.get(`style_${style.code}`) !== "on") continue;
    await query(
      `INSERT INTO requirements (project_id, traveller_id, level, category, code, value)
       VALUES ($1, $2, 'preferred', 'style', $3, '{}'::jsonb)`,
      [projectId, travellerId, style.code]
    );
  }

  // ---- health details ----------------------------------------------------
  // Only stored when the traveller chose to share them. Choosing "no" or
  // "prefer not to say" deletes anything previously stored, rather than
  // quietly keeping it.
  if (formData.get("health_disclosure") === "yes") {
    const times = String(formData.get("medication_times") ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}:\d{2}$/.test(s));

    await query(
      `INSERT INTO health_details (
         traveller_id, carries_medication, medication_times, needs_refrigeration,
         needs_documentation, carries_equipment, equipment_note, wants_reminders,
         insurance_provider, insurance_phone, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (traveller_id) DO UPDATE SET
         carries_medication = EXCLUDED.carries_medication,
         medication_times = EXCLUDED.medication_times,
         needs_refrigeration = EXCLUDED.needs_refrigeration,
         needs_documentation = EXCLUDED.needs_documentation,
         carries_equipment = EXCLUDED.carries_equipment,
         equipment_note = EXCLUDED.equipment_note,
         wants_reminders = EXCLUDED.wants_reminders,
         insurance_provider = EXCLUDED.insurance_provider,
         insurance_phone = EXCLUDED.insurance_phone,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [
        travellerId,
        formData.get("carries_medication") === "on",
        times,
        formData.get("needs_refrigeration") === "on",
        formData.get("needs_documentation") === "on",
        formData.get("carries_equipment") === "on",
        text("equipment_note"),
        formData.get("wants_reminders") === "on",
        text("insurance_provider"),
        text("insurance_phone"),
        text("health_notes"),
      ]
    );
  } else {
    await query("DELETE FROM health_details WHERE traveller_id = $1", [travellerId]);
  }

  revalidatePath(`/trips/${projectId}`);
  redirect(`/trips/${projectId}/people?saved=${travellerId}`);
}

/** Used by the "email me my links" button on the trip screen. */
export async function noopOwnerCheck() {
  await currentOwner();
}

export async function presetCodesInUse(projectId: string): Promise<string[]> {
  const rows = await query<{ code: string }>(
    "SELECT DISTINCT code FROM requirements WHERE project_id = $1",
    [projectId]
  );
  return rows.map((r) => r.code).filter((c) => PRESET_BY_CODE[c]);
}
