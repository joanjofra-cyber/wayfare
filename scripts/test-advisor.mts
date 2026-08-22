/**
 * Checks the advisor's plumbing without spending anything: the group summary
 * that goes into the prompt, and the parsing of what comes back — including
 * the code fence models like to add however firmly you ask them not to.
 *
 *   node --experimental-strip-types scripts/test-advisor.ts
 */
import { getAdvice, suggestionToDraft } from "../src/lib/advisor.ts";
import type { Requirement, Traveller } from "../src/lib/types.ts";

const travellers = [
  { id: "t1", name: "Grandad", age: 82 },
  { id: "t2", name: "Marta", age: 41 },
  { id: "t3", name: "Leo", age: 9 },
].map((t) => ({ ...t, project_id: "p", owner_id: null, phone: null, email: null,
  country: null, language: null, currency: null, timezone: null, travels_with: [],
  priorities: [], health_disclosure: null, share_needs: true, profile_completed_at: null,
})) as unknown as Traveller[];

const requirements = [
  { traveller_id: "t1", level: "mandatory", category: "mobility", code: "max_walking_minutes", value: { minutes: 10 } },
  { traveller_id: "t2", level: "mandatory", category: "diet", code: "gluten_free", value: {} },
  { traveller_id: "t2", level: "preferred", category: "interest", code: "museum", value: {} },
] as unknown as Requirement[];

let failures = 0;
const check = (name: string, condition: boolean, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : ` — ${detail}`}`);
  if (!condition) failures++;
};

// ---- without a key, it must decline rather than throw ----------------------
delete process.env.ANTHROPIC_API_KEY;
const noKey = await getAdvice({
  destination: "Rome", startDate: null, endDate: null, currency: "EUR",
  travellers, requirements, existing: [],
});
check("no key is reported, not thrown", !noKey.ok && noKey.reason === "no_key");

// ---- the prompt must actually carry the group's constraints ----------------
process.env.ANTHROPIC_API_KEY = "test-key";
let capturedPrompt = "";
const realFetch = globalThis.fetch;

globalThis.fetch = (async (_url: string, init: RequestInit) => {
  capturedPrompt = JSON.parse(String(init.body)).messages[0].content;
  return new Response(
    JSON.stringify({
      content: [{
        type: "text",
        // Deliberately fenced, which is what models actually do.
        text: "```json\n" + JSON.stringify({
          summary: "We kept walking short for Grandad.",
          suggestions: [{
            title: "Galleria Borghese", why: "Marta likes museums and it is a short walk.",
            kind: "activity", location_name: "Piazzale Scipione Borghese 5",
            walking_minutes: 8, best_time: "16:00", cost_estimate: 15,
            accessibility_note: "Step-free entrance; lift to upper floor.",
            tags: ["museum", "art"],
          }],
        }) + "\n```",
      }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}) as typeof fetch;

const result = await getAdvice({
  destination: "Rome", startDate: "2026-09-12", endDate: "2026-09-17", currency: "EUR",
  travellers, requirements, existing: [],
});

check("Grandad's walking limit reaches the prompt", capturedPrompt.includes("Limit on walking at one time (10)"), capturedPrompt.slice(0, 300));
check("Marta's coeliac requirement reaches the prompt", capturedPrompt.includes("Coeliac / gluten-free"));
check("Marta's interest reaches the prompt", capturedPrompt.includes("enjoys: museum"));
check("Leo's age reaches the prompt", capturedPrompt.includes("Leo — 9 years old"));
check("a fenced JSON reply parses", result.ok, result.ok ? "" : result.reason);

if (result.ok) {
  check("the summary survives", result.advice.summary.includes("Grandad"));
  const draft = suggestionToDraft(result.advice.suggestions[0], "2026-09-12");
  check("draft keeps the title", draft.title === "Galleria Borghese");
  check("draft keeps the time", draft.starts_at === "16:00");
  check(
    "the access claim is recorded as the model's opinion, not as fact",
    Boolean(draft.notes?.includes("model's note")) || Boolean(draft.notes?.includes("model’s note")),
    draft.notes ?? ""
  );
  check(
    "no accessibility attribute is asserted from a guess",
    !("wheelchair_accessible" in draft) && !("has_stairs" in draft)
  );
}

// ---- a broken reply must be reported, not crash ---------------------------
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ content: [{ type: "text", text: "sorry, no." }] }), { status: 200 })) as typeof fetch;
const broken = await getAdvice({
  destination: "Rome", startDate: null, endDate: null, currency: "EUR",
  travellers, requirements, existing: [],
});
check("an unparseable reply is reported", !broken.ok && broken.reason === "unparseable");

globalThis.fetch = realFetch;
console.log(failures === 0 ? "\nAll advisor checks passed." : `\n${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
