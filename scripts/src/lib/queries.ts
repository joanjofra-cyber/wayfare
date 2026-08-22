import { one, query } from "./db";
import type { ItemWithContext } from "./conflicts";
import type { Change, HealthDetails, Item, ItemAttributes, Project, Requirement, Traveller } from "./types";

export async function getProject(id: string): Promise<Project | null> {
  return one<Project>("SELECT * FROM projects WHERE id = $1", [id]);
}

export async function getProjectByShareToken(token: string): Promise<Project | null> {
  return one<Project>("SELECT * FROM projects WHERE share_token = $1", [token]);
}

export async function getTravellers(projectId: string): Promise<Traveller[]> {
  return query<Traveller>(
    "SELECT * FROM travellers WHERE project_id = $1 ORDER BY created_at",
    [projectId]
  );
}

export async function getRequirements(projectId: string): Promise<Requirement[]> {
  return query<Requirement>("SELECT * FROM requirements WHERE project_id = $1", [projectId]);
}

export async function getHealth(travellerId: string): Promise<HealthDetails | null> {
  return one<HealthDetails>("SELECT * FROM health_details WHERE traveller_id = $1", [travellerId]);
}

export async function getItems(projectId: string): Promise<ItemWithContext[]> {
  const items = await query<Item>(
    `SELECT * FROM items WHERE project_id = $1
      ORDER BY day, (starts_at IS NULL), starts_at, sort_order, created_at`,
    [projectId]
  );
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const attrs = await query<ItemAttributes>(
    "SELECT * FROM item_attributes WHERE item_id = ANY($1::uuid[])",
    [ids]
  );
  const parts = await query<{ item_id: string; traveller_id: string }>(
    "SELECT * FROM item_participants WHERE item_id = ANY($1::uuid[])",
    [ids]
  );

  const attrsById = new Map(attrs.map((a) => [a.item_id, a]));
  const partsById = new Map<string, string[]>();
  for (const p of parts) {
    const list = partsById.get(p.item_id) ?? [];
    list.push(p.traveller_id);
    partsById.set(p.item_id, list);
  }

  return items.map((item) => ({
    ...item,
    attrs: attrsById.get(item.id) ?? null,
    participantIds: partsById.get(item.id) ?? [],
  }));
}

export async function getChanges(projectId: string, limit = 30): Promise<Change[]> {
  return query<Change>(
    "SELECT * FROM changes WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
    [projectId, limit]
  );
}

/** Requirement codes anybody on this trip actually has — drives which item
 *  attributes the form bothers to ask about. */
export async function activeRequirementCodes(projectId: string): Promise<string[]> {
  const rows = await query<{ code: string }>(
    "SELECT DISTINCT code FROM requirements WHERE project_id = $1 AND level = 'mandatory'",
    [projectId]
  );
  return rows.map((r) => r.code);
}

/**
 * The one line under an item's title. A flight should read like a flight —
 * "BCN → FCO · VY6000 · Terminal 1" — not like a generic calendar entry.
 */
export function itemSubtitle(item: {
  kind: string;
  mode?: string | null;
  carrier?: string | null;
  service_number?: string | null;
  origin_code?: string | null;
  destination_code?: string | null;
  origin?: string | null;
  destination?: string | null;
  terminal?: string | null;
  location_name?: string | null;
  day?: string;
  ends_day?: string | null;
  attrs?: { walking_minutes: number | null } | null;
}): string {
  const parts: string[] = [];

  if (item.kind === "transport") {
    const from = item.origin_code || item.origin;
    const to = item.destination_code || item.destination;
    if (from && to) parts.push(`${from} → ${to}`);
    const service = [item.carrier, item.service_number].filter(Boolean).join(" ");
    if (service) parts.push(service);
    if (item.terminal) parts.push(`Terminal ${item.terminal}`);
  } else if (item.kind === "lodging") {
    if (item.carrier) parts.push(item.carrier);
    if (item.day && item.ends_day) {
      const nights = Math.round(
        (new Date(`${String(item.ends_day).slice(0, 10)}T00:00:00`).getTime() -
          new Date(`${String(item.day).slice(0, 10)}T00:00:00`).getTime()) / 86400000
      );
      if (nights > 0) parts.push(`${nights} ${nights === 1 ? "night" : "nights"}`);
    }
    if (item.service_number) parts.push(item.service_number);
  }

  if (item.location_name && !parts.includes(item.location_name)) parts.push(item.location_name);
  if (item.attrs?.walking_minutes) parts.push(`${item.attrs.walking_minutes} min walking`);

  return parts.join(" · ");
}

export function inboxAddress(inboxToken: string): string {
  // `??` only substitutes when the variable is absent. An environment variable
  // that exists but is empty — easy to create by accident in a hosting
  // dashboard — sails straight through it and produces "+token@undefined".
  // Hence the trim, and hence checking the address actually looks like one.
  const configured = (process.env.GMAIL_USER ?? "").trim();
  const user = configured.includes("@") ? configured : "tour.repot@gmail.com";
  const [local, domain] = user.split("@");
  return `${local}+${inboxToken}@${domain}`;
}

export function shareUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/t/${token}`;
}

/** Days between start and end, or the days that already have something on them. */
export function tripDays(project: Project, items: { day: string }[]): string[] {
  const set = new Set<string>();
  if (project.start_date && project.end_date) {
    const start = new Date(project.start_date);
    const end = new Date(project.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      set.add(d.toISOString().slice(0, 10));
    }
  }
  for (const item of items) set.add(String(item.day).slice(0, 10));
  return [...set].sort();
}

export function formatDay(day: string, todayIso: string): { date: string; rel: string | null } {
  const d = new Date(`${day}T00:00:00`);
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const diff = Math.round(
    (new Date(`${day}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000
  );
  let rel: string | null = null;
  if (diff === 0) rel = "Today";
  else if (diff === 1) rel = "Tomorrow";
  else if (diff === -1) rel = "Yesterday";
  else if (diff > 1) rel = `in ${diff} days`;
  return { date, rel };
}

/** "Today" always means today where the trip is, never where the reader is. */
export function todayInTrip(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function nowTimeInTrip(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
