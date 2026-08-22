import { PRESET_BY_CODE } from "./presets";
import type { Item, Requirement, Traveller } from "./types";

/**
 * Asking a model what this particular group could do at their destination.
 *
 * The whole value is in the question, not the answer. Anyone can ask "what is
 * there to do in Rome". This app knows something no travel site does: that one
 * traveller cannot walk more than ten minutes, that another is coeliac, and
 * that there is a nine-year-old who cannot come to the wine tasting. Handing
 * those constraints to the model is what turns a generic list into a plan.
 *
 * Two rules govern what comes back:
 *
 *   1. A suggestion is a draft, never a saved item. It goes through the same
 *      confirm-before-save screen as a forwarded booking.
 *   2. Anything the model asserts about accessibility is a *claim*, not a fact.
 *      It is displayed as the model's note, and the corresponding attribute
 *      stays "unknown" — so the requirement engine reports it as unverified
 *      until a human confirms it. An estimate wearing the clothes of a fact is
 *      worse than no estimate at all.
 */

export interface Suggestion {
  title: string;
  why: string;
  kind: "activity" | "meal";
  location_name?: string;
  walking_minutes?: number;
  min_age?: number;
  best_time?: string;
  cost_estimate?: number;
  accessibility_note?: string;
  tags?: string[];
}

export interface Advice {
  summary: string;
  suggestions: Suggestion[];
}

export type AdviceResult =
  | { ok: true; advice: Advice }
  | { ok: false; reason: string };

/** Free Vercel functions are killed at 10 seconds, so leave room to respond. */
const TIMEOUT_MS = 8500;

function describeGroup(travellers: Traveller[], requirements: Requirement[]): string {
  const lines: string[] = [];

  for (const traveller of travellers) {
    const theirs = requirements.filter((r) => r.traveller_id === traveller.id);
    const must = theirs
      .filter((r) => r.level === "mandatory")
      .map((r) => {
        const label = PRESET_BY_CODE[r.code]?.label ?? r.code;
        const value = Object.values(r.value ?? {})[0];
        return value === undefined ? label : `${label} (${value})`;
      });
    const likes = theirs
      .filter((r) => r.level === "preferred" && r.category === "interest")
      .map((r) => r.code);

    const bits = [traveller.age != null ? `${traveller.age} years old` : null];
    if (must.length) bits.push(`must have: ${must.join("; ")}`);
    if (likes.length) bits.push(`enjoys: ${likes.join(", ")}`);
    lines.push(`- ${traveller.name}${bits.filter(Boolean).length ? " — " + bits.filter(Boolean).join(" · ") : ""}`);
  }

  return lines.join("\n") || "- (nobody added yet)";
}

export async function getAdvice(params: {
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  travellers: Traveller[];
  requirements: Requirement[];
  existing: Item[];
}): Promise<AdviceResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no_key" };
  if (!params.destination) return { ok: false, reason: "no_destination" };

  const already = params.existing.map((i) => i.title).slice(0, 30);

  const prompt = `You are helping plan a group trip to ${params.destination}${
    params.startDate ? `, from ${params.startDate} to ${params.endDate ?? params.startDate}` : ""
  }.

The group:
${describeGroup(params.travellers, params.requirements)}

Already planned (do not repeat these):
${already.length ? already.map((t) => `- ${t}`).join("\n") : "- nothing yet"}

Suggest 5 things this specific group could do. Every suggestion must work for
everyone listed, or be clearly worth it for a subset — if it excludes someone,
say so plainly in "why".

Rules:
- Be concrete. Name real places in ${params.destination}, not categories.
- "why" is one sentence and must refer to this group's actual needs or interests
  by name. Not marketing copy.
- walking_minutes is your honest estimate of walking the activity involves.
- accessibility_note: what you believe about step-free access, seating and
  toilets. Say "unknown" where you are not sure. Do not guess confidently.
- Costs in ${params.currency}, per person, approximate.
- tags from: museum, live_music, football, nature, history, food, art,
  architecture, market, shopping, nightlife, beach.

Also write "summary": 2-3 sentences telling the group how this itinerary has
been shaped around them, naming the specific accommodations made. Plain, warm,
no marketing language.

Reply with JSON only, no prose around it:
{"summary":"...","suggestions":[{"title":"","why":"","kind":"activity|meal","location_name":"","walking_minutes":0,"min_age":0,"best_time":"HH:MM","cost_estimate":0,"accessibility_note":"","tags":[]}]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Haiku by default: the free Vercel tier kills a function at ten
        // seconds, and a slower model would routinely miss that window.
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, reason: `${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === "text")?.text ?? "";

    // Models sometimes wrap JSON in a code fence however firmly you ask.
    const json = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const start = json.indexOf("{");
    const end = json.lastIndexOf("}");
    if (start < 0 || end < start) return { ok: false, reason: "unparseable" };

    const parsed = JSON.parse(json.slice(start, end + 1)) as Advice;
    if (!Array.isArray(parsed.suggestions)) return { ok: false, reason: "unparseable" };

    return {
      ok: true,
      advice: {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        suggestions: parsed.suggestions.slice(0, 6),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** A suggestion, turned into the same kind of draft a forwarded booking makes. */
export function suggestionToDraft(suggestion: Suggestion, day: string): Partial<Item> {
  return {
    title: suggestion.title,
    kind: suggestion.kind === "meal" ? "meal" : "activity",
    day,
    starts_at: /^\d{2}:\d{2}$/.test(suggestion.best_time ?? "") ? suggestion.best_time : null,
    location_name: suggestion.location_name ?? null,
    cost: suggestion.cost_estimate != null ? String(suggestion.cost_estimate) : null,
    notes: suggestion.accessibility_note
      ? `Suggested by Wayfare. The model's note on access: ${suggestion.accessibility_note}`
      : "Suggested by Wayfare.",
  };
}
