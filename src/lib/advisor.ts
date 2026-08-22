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

/**
 * How long to wait for the model.
 *
 * This was originally 8.5 seconds, chosen against Vercel's old 10-second cap
 * on free functions. With Fluid compute — the default for new projects — the
 * Hobby limit is 300 seconds, so the tight budget was solving a problem that
 * no longer exists, and it was cutting off perfectly good answers.
 *
 * 45 seconds is generous for this call and still fails fast enough that
 * somebody standing in front of an audience is not left staring at a spinner.
 */
const TIMEOUT_MS = 45_000;

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

Use the propose_activities tool to reply.`;

  // Asking for "JSON only" and parsing the reply is asking for trouble: the
  // model wraps it in a code fence, or writes a sentence first, or — as
  // happened here — runs out of room mid-array and produces JSON that cannot
  // be parsed at all. Declaring a tool makes the shape part of the request, so
  // what comes back is already an object.
  const tool = {
    name: "propose_activities",
    description: "Return suggested activities for this group, plus a summary of how the trip fits them.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "2-3 sentences on how the itinerary has been shaped around these people.",
        },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              why: { type: "string", description: "One sentence, naming this group's actual needs or interests." },
              kind: { type: "string", enum: ["activity", "meal"] },
              location_name: { type: "string" },
              walking_minutes: { type: "integer", description: "Honest estimate of walking involved." },
              min_age: { type: "integer", description: "Omit if there is no age restriction." },
              best_time: { type: "string", description: "HH:MM, 24-hour." },
              cost_estimate: { type: "number", description: "Per person, approximate." },
              accessibility_note: {
                type: "string",
                description: "What you believe about step-free access, seating and toilets. Say 'unknown' where unsure.",
              },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "why", "kind"],
          },
        },
      },
      required: ["summary", "suggestions"],
    },
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Sonnet by default. The suggestions are the whole point of this
        // feature, and a better model reasons about the group's constraints
        // noticeably better. Set ANTHROPIC_MODEL to claude-haiku-4-5-20251001
        // if you would rather have speed.
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
        // Generous, so a long answer is never truncated mid-structure.
        max_tokens: 4000,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, reason: `${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      stop_reason?: string;
      content?: { type: string; text?: string; name?: string; input?: unknown }[];
    };

    const call = data.content?.find((block) => block.type === "tool_use");
    let parsed = call?.input as Advice | undefined;

    // Fallback for the rare case where the model answers in prose anyway.
    if (!parsed) {
      const text = data.content?.find((block) => block.type === "text")?.text ?? "";
      const json = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const start = json.indexOf("{");
      const end = json.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(json.slice(start, end + 1)) as Advice;
        } catch {
          parsed = undefined;
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.suggestions)) {
      // `max_tokens` means the answer was cut off rather than malformed, and
      // that is worth saying differently — one is our fault, one is not.
      return { ok: false, reason: data.stop_reason === "max_tokens" ? "truncated" : "unparseable" };
    }

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
