import { PRESET_BY_CODE } from "./presets";
import type { Item, ItemAttributes, Requirement, Traveller, Tri } from "./types";

/**
 * The requirement engine.
 *
 * Three outcomes, and the third one is the point:
 *   conflict   — a mandatory requirement is broken. Red.
 *   unverified — we do not know enough to say. Amber.
 *   match      — something somebody said they enjoy. Green.
 *
 * "Unverified" matters as much as "conflict". An app that only ever says yes
 * or no is claiming knowledge it does not have; one that admits what it has
 * not been told is one people can trust. Nothing here ever blocks a save — the
 * organiser may know something we do not, and the human decides.
 */

export type Severity = "conflict" | "unverified" | "match";

export interface Finding {
  severity: Severity;
  code: string;
  itemId: string | null;
  day: string | null;
  travellerId: string | null;
  travellerName: string | null;
  message: string;
  /** Set when the app knows the fix, not just the problem. */
  suggestion?: { kind: "remove-participants"; travellerIds: string[]; label: string };
}

export interface ItemWithContext extends Item {
  attrs: ItemAttributes | null;
  participantIds: string[]; // empty means everybody
}

export interface EvalInput {
  items: ItemWithContext[];
  travellers: Traveller[];
  requirements: Requirement[];
}

const DAILY_WALKING: Record<string, number> = { minimal: 30, moderate: 90, extensive: 240 };
const PACE_MAX_ACTIVITIES: Record<string, number> = { relaxed: 2, balanced: 4, packed: 99 };

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Who this item actually applies to. No participant rows means everybody. */
function attendees(item: ItemWithContext, travellers: Traveller[]): Traveller[] {
  if (item.participantIds.length === 0) return travellers;
  const set = new Set(item.participantIds);
  return travellers.filter((t) => set.has(t.id));
}

/** A tri-state attribute: does it break the requirement, or is it just unknown? */
function triCheck(value: Tri | undefined | null): "conflict" | "unverified" | "ok" {
  if (value === "no") return "conflict";
  if (value === "yes") return "ok";
  return "unverified";
}

/** Stairs are only a problem when there is no lift. */
function stairsCheck(attrs: ItemAttributes | null): "conflict" | "unverified" | "ok" {
  if (!attrs) return "unverified";
  if (attrs.has_stairs === true && attrs.has_lift !== true) return "conflict";
  if (attrs.has_stairs === false) return "ok";
  if (attrs.has_stairs === true && attrs.has_lift === true) return "ok";
  return "unverified";
}

function name(t: Traveller | null): string {
  return t ? t.name : "the group";
}

function checkOne(
  item: ItemWithContext,
  req: Requirement,
  holder: Traveller | null
): { severity: Severity; message: string } | null {
  const a = item.attrs;
  const who = name(holder);
  const possessive = holder ? `${holder.name}'s` : "the group's";

  switch (req.code) {
    case "wheelchair": {
      const access = triCheck(a?.wheelchair_accessible);
      if (access === "conflict")
        return { severity: "conflict", message: `Not wheelchair accessible — ${who} needs step-free access.` };
      const stairs = stairsCheck(a);
      if (stairs === "conflict")
        return { severity: "conflict", message: `Has stairs and no lift — ${who} uses a wheelchair.` };
      if (access === "unverified")
        return { severity: "unverified", message: `Wheelchair access not confirmed, and ${who} needs it.` };
      return null;
    }
    case "step_free":
    case "no_stairs": {
      const stairs = stairsCheck(a);
      if (stairs === "conflict")
        return { severity: "conflict", message: `Stairs with no lift — ${who} can't manage them.` };
      if (stairs === "unverified")
        return { severity: "unverified", message: `Step-free access not confirmed for ${who}.` };
      return null;
    }
    case "pushchair": {
      const stairs = stairsCheck(a);
      if (stairs === "conflict")
        return { severity: "conflict", message: `Stairs with no lift — awkward with ${possessive} pushchair.` };
      if (a?.terrain === "rough")
        return { severity: "conflict", message: `Rough ground — not passable with a pushchair.` };
      return null;
    }
    case "max_walking_minutes": {
      const limit = num(req.value.minutes, 15);
      const walk = a?.walking_minutes;
      if (walk == null) return { severity: "unverified", message: `Walking distance unknown, and ${who} has a ${limit} min limit.` };
      if (walk > limit)
        return { severity: "conflict", message: `${walk} min of walking — above ${possessive} ${limit} min limit.` };
      return null;
    }
    case "frequent_rest": {
      const seat = triCheck(a?.seating_available);
      if (seat === "conflict") return { severity: "conflict", message: `Nowhere to sit — ${who} needs regular rests.` };
      if (seat === "unverified") return { severity: "unverified", message: `Seating not confirmed, and ${who} needs regular rests.` };
      return null;
    }
    case "avoid_steep": {
      if (a?.terrain === "hilly" || a?.terrain === "rough")
        return { severity: "conflict", message: `${a.terrain === "rough" ? "Rough" : "Steep"} ground — ${who} should avoid it.` };
      if (!a?.terrain) return { severity: "unverified", message: `Terrain unknown, and ${who} avoids steep ground.` };
      return null;
    }
    case "child_car_seat": {
      const seat = triCheck(a?.child_seat_available);
      if (seat === "conflict") return { severity: "conflict", message: `No child seat available — ${who} needs one.` };
      if (seat === "unverified") return { severity: "unverified", message: `Child seat not confirmed for ${who}.` };
      return null;
    }
    case "needs_cot": {
      const cot = triCheck(a?.cot_available);
      if (cot === "conflict") return { severity: "conflict", message: `No cot available — ${who} needs one.` };
      if (cot === "unverified") return { severity: "unverified", message: `Cot not confirmed for ${who}.` };
      return null;
    }
    case "gluten_free": {
      const gf = triCheck(a?.gluten_free_options);
      if (gf === "conflict") return { severity: "conflict", message: `No gluten-free options — ${who} is coeliac.` };
      if (gf === "unverified") return { severity: "unverified", message: `Gluten-free options not confirmed for ${who}.` };
      return null;
    }
    case "vegetarian": {
      const v = triCheck(a?.vegetarian_options);
      if (v === "conflict") return { severity: "conflict", message: `No vegetarian options — ${who} is vegetarian.` };
      if (v === "unverified") return { severity: "unverified", message: `Vegetarian options not confirmed for ${who}.` };
      return null;
    }
    case "vegan": {
      const v = triCheck(a?.vegan_options);
      if (v === "conflict") return { severity: "conflict", message: `No vegan options — ${who} is vegan.` };
      if (v === "unverified") return { severity: "unverified", message: `Vegan options not confirmed for ${who}.` };
      return null;
    }
    case "avoid_crowds": {
      if (a?.crowded === true)
        return { severity: "conflict", message: `Usually crowded — ${who} prefers quieter places.` };
      return null;
    }
    case "heat_sensitive": {
      const start = item.starts_at ? parseInt(item.starts_at.slice(0, 2), 10) : null;
      if (a?.outdoor === true && start !== null && start >= 11 && start < 17)
        return { severity: "conflict", message: `Outdoors in the middle of the day — ${who} is sensitive to heat.` };
      return null;
    }
    case "no_early_starts": {
      const limit = String(req.value.time ?? "09:00");
      if (item.starts_at && item.starts_at.slice(0, 5) < limit)
        return { severity: "conflict", message: `Starts at ${item.starts_at.slice(0, 5)} — ${who} prefers nothing before ${limit}.` };
      return null;
    }
    case "max_item_spend": {
      const limit = num(req.value.amount, 50);
      const cost = item.cost ? parseFloat(item.cost) : null;
      if (cost != null && cost > limit)
        return { severity: "conflict", message: `${cost} per person — above ${possessive} ${limit} limit for one activity.` };
      return null;
    }
    // Reminder-only requirements: real, but not machine-checkable. They are
    // surfaced in the UI as standing notes rather than silently ignored.
    default:
      return null;
  }
}

export function evaluate({ items, travellers, requirements }: EvalInput): Finding[] {
  const findings: Finding[] = [];
  const travellerById = new Map(travellers.map((t) => [t.id, t]));
  const mandatory = requirements.filter((r) => r.level === "mandatory");
  const preferred = requirements.filter((r) => r.level === "preferred");

  // ------------------------------------------------------------ per item --
  for (const item of items) {
    if (item.kind === "note") continue;
    const going = attendees(item, travellers);
    const goingIds = new Set(going.map((t) => t.id));

    for (const req of mandatory) {
      const preset = PRESET_BY_CODE[req.code];
      if (!preset || !preset.kinds.includes(item.kind) || preset.dayLevel) continue;
      // A requirement only counts if the person holding it is actually going.
      if (req.traveller_id && !goingIds.has(req.traveller_id)) continue;
      const holder = req.traveller_id ? travellerById.get(req.traveller_id) ?? null : null;

      const result = checkOne(item, req, holder);
      if (result) {
        findings.push({
          severity: result.severity,
          code: req.code,
          itemId: item.id,
          day: item.day,
          travellerId: req.traveller_id,
          travellerName: holder?.name ?? null,
          message: result.message,
        });
      }
    }

    // Age restrictions are not a requirement anybody types in — they are a
    // fact about the group. When the app knows both the problem AND the fix,
    // it offers the fix instead of raising an alarm.
    if (item.attrs?.min_age != null) {
      const tooYoung = going.filter((t) => t.age != null && t.age < item.attrs!.min_age!);
      if (tooYoung.length > 0) {
        const names = tooYoung.map((t) => t.name).join(" and ");
        findings.push({
          severity: "conflict",
          code: "min_age",
          itemId: item.id,
          day: item.day,
          travellerId: null,
          travellerName: null,
          message: `Minimum age is ${item.attrs.min_age}. ${names} can't attend.`,
          suggestion: {
            kind: "remove-participants",
            travellerIds: tooYoung.map((t) => t.id),
            label: `Remove ${names} from this activity`,
          },
        });
      }
    }

    // Interests: a positive note, never a warning.
    const tags = new Set(item.attrs?.tags ?? []);
    if (tags.size > 0) {
      for (const req of preferred) {
        if (req.category !== "interest" || !tags.has(req.code)) continue;
        const holder = req.traveller_id ? travellerById.get(req.traveller_id) ?? null : null;
        if (req.traveller_id && !goingIds.has(req.traveller_id)) continue;
        findings.push({
          severity: "match",
          code: req.code,
          itemId: item.id,
          day: item.day,
          travellerId: req.traveller_id,
          travellerName: holder?.name ?? null,
          message: holder ? `${holder.name} is interested in this.` : `Matches the group's interests.`,
        });
      }
    }
  }

  // ------------------------------------------------------------- per day --
  const byDay = new Map<string, ItemWithContext[]>();
  for (const item of items) {
    const list = byDay.get(item.day) ?? [];
    list.push(item);
    byDay.set(item.day, list);
  }

  for (const [day, dayItems] of byDay) {
    for (const req of mandatory.concat(preferred)) {
      const preset = PRESET_BY_CODE[req.code];
      if (!preset?.dayLevel) continue;
      const holder = req.traveller_id ? travellerById.get(req.traveller_id) ?? null : null;
      const who = name(holder);

      // Only count items this person is actually attending.
      const theirItems = dayItems.filter((it) => {
        if (!req.traveller_id) return true;
        return it.participantIds.length === 0 || it.participantIds.includes(req.traveller_id);
      });

      if (req.code === "daily_walking_limit") {
        const limit = DAILY_WALKING[String(req.value.level ?? "moderate")] ?? 90;
        const total = theirItems.reduce((sum, it) => sum + (it.attrs?.walking_minutes ?? 0), 0);
        if (total > limit)
          findings.push({
            severity: "conflict", code: req.code, itemId: null, day,
            travellerId: req.traveller_id, travellerName: holder?.name ?? null,
            message: `${total} min of walking this day — above ${who}'s ${limit} min daily limit.`,
          });
      }

      if (req.code === "max_daily_spend") {
        const limit = num(req.value.amount, 100);
        const total = theirItems.reduce((sum, it) => sum + (it.cost ? parseFloat(it.cost) : 0), 0);
        if (total > limit)
          findings.push({
            severity: "conflict", code: req.code, itemId: null, day,
            travellerId: req.traveller_id, travellerName: holder?.name ?? null,
            message: `${total.toFixed(0)} per person this day — above ${who}'s ${limit} daily limit.`,
          });
      }

      if (req.code === "max_activities_per_day" || req.code === "pace_level") {
        const limit =
          req.code === "pace_level"
            ? PACE_MAX_ACTIVITIES[String(req.value.level ?? "balanced")] ?? 4
            : num(req.value.count, 3);
        const count = theirItems.filter((it) => it.kind === "activity").length;
        if (count > limit)
          findings.push({
            severity: req.level === "mandatory" ? "conflict" : "unverified",
            code: req.code, itemId: null, day,
            travellerId: req.traveller_id, travellerName: holder?.name ?? null,
            message: `${count} activities this day — busier than ${who} likes (${limit}).`,
          });
      }

      if (req.code === "afternoon_rest") {
        const afternoon = theirItems
          .filter((it) => it.starts_at && it.starts_at >= "14:00" && it.starts_at < "18:00")
          .length;
        if (afternoon >= 2)
          findings.push({
            severity: "unverified", code: req.code, itemId: null, day,
            travellerId: req.traveller_id, travellerName: holder?.name ?? null,
            message: `No clear break this afternoon, and ${who} likes one.`,
          });
      }
    }
  }

  return findings;
}

/** Findings grouped by item, for rendering next to each row. */
export function byItem(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.itemId) continue;
    const list = map.get(f.itemId) ?? [];
    list.push(f);
    map.set(f.itemId, list);
  }
  return map;
}

export function summarise(findings: Finding[]) {
  return {
    conflicts: findings.filter((f) => f.severity === "conflict").length,
    unverified: findings.filter((f) => f.severity === "unverified").length,
    matches: findings.filter((f) => f.severity === "match").length,
  };
}
