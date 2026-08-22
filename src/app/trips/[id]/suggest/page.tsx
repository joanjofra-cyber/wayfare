import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdvice, suggestionToDraft } from "@/lib/advisor";
import {
  activeRequirementCodes,
  getItems,
  getProject,
  getRequirements,
  getTravellers,
  todayInTrip,
} from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import ItemForm from "@/components/ItemForm";
import TopBar from "@/components/TopBar";
import TripNav from "@/components/TripNav";

/** Asking a model takes longer than rendering a page. Fluid compute allows up
 *  to 300s even on the free plan; 60 is far more than this needs. */
export const maxDuration = 60;

export default async function SuggestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ go?: string }>;
}) {
  const { id } = await params;
  const { go } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);

  const [owner, travellers, requirements, items, activeCodes] = await Promise.all([
    currentOwner(),
    getTravellers(id),
    getRequirements(id),
    getItems(id),
    activeRequirementCodes(id),
  ]);

  const firstDay = project.start_date?.slice(0, 10) ?? todayInTrip(project.timezone);
  // Only call the model when explicitly asked. A page that spends money every
  // time somebody refreshes it is a bad page.
  const result = go ? await getAdvice({
    destination: project.destination,
    startDate: project.start_date,
    endDate: project.end_date,
    currency: project.currency,
    travellers,
    requirements,
    existing: items,
  }) : null;

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{project.name}</div>
        <div className="sub">Ideas for your group</div>
      </div>
      <TripNav projectId={id} active="itinerary" />

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Ask for ideas</h2>
        <p className="small muted">
          Wayfare knows who is coming and what each of them needs. It asks for
          things to do in {project.destination ?? "your destination"} that work
          for <em>this</em> group — not a generic list.
        </p>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <Link className="btn btn-primary" href={`/trips/${id}/suggest?go=1`}>
            {go ? "Ask again" : "Suggest things to do"}
          </Link>
          <Link className="btn btn-ghost" href={`/trips/${id}`}>
            Back to itinerary
          </Link>
        </div>
      </div>

      {!project.destination && (
        <div className="finding finding-unverified" style={{ marginBottom: "1.5rem" }}>
          <span className="dot dot-unverified" />
          <span>
            Set a destination on the itinerary screen first — without it there is
            nothing to suggest.
          </span>
        </div>
      )}

      {result && !result.ok && (
        <div className="finding finding-conflict" style={{ marginBottom: "1.5rem" }}>
          <span className="dot dot-conflict" />
          <span>
            {result.reason === "no_key"
              ? "Suggestions aren't switched on — ANTHROPIC_API_KEY isn't set."
              : result.reason === "timeout"
                ? "The model took more than 45 seconds, which usually means it is having a bad moment rather than anything being wrong here. Try again."
                : result.reason === "unparseable"
                  ? "The reply came back in a shape we couldn't read. Try again."
                  : `Couldn't get suggestions. ${result.reason}`}
          </span>
        </div>
      )}

      {result?.ok && (
        <>
          {result.advice.summary && (
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ marginBottom: "0.5rem" }}>How this trip fits your group</h2>
              <p style={{ margin: 0 }}>{result.advice.summary}</p>
            </div>
          )}

          <h2 style={{ marginBottom: "0.25rem" }}>Ideas</h2>
          <p className="section-hint">
            Nothing here is saved. Open one to check it and add it — and note that
            anything the model says about access is <strong>its opinion, not a
            confirmed fact</strong>, so those stay unverified until you check them.
          </p>

          <div className="stack">
            {result.advice.suggestions.map((suggestion, index) => (
              <details className="card" key={`${suggestion.title}-${index}`}>
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <div className="row-tight">
                    <strong style={{ fontSize: "1.05rem" }}>{suggestion.title}</strong>
                    {suggestion.walking_minutes != null && (
                      <span className="badge badge-quiet">~{suggestion.walking_minutes} min walking</span>
                    )}
                    {suggestion.min_age ? (
                      <span className="badge badge-quiet">{suggestion.min_age}+</span>
                    ) : null}
                    {suggestion.cost_estimate != null && (
                      <span className="badge badge-quiet">
                        ~{suggestion.cost_estimate} {project.currency}
                      </span>
                    )}
                  </div>
                  <div className="small muted" style={{ marginTop: "0.25rem" }}>
                    {suggestion.why}
                  </div>
                  {suggestion.accessibility_note && (
                    <div className="finding finding-unverified" style={{ marginTop: "0.5rem" }}>
                      <span className="dot dot-unverified" />
                      <span>
                        Model&apos;s note on access, unverified: {suggestion.accessibility_note}
                      </span>
                    </div>
                  )}
                </summary>

                <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--line)", marginTop: "0.75rem" }}>
                  <ItemForm
                    projectId={id}
                    travellers={travellers}
                    activeCodes={activeCodes}
                    draft={suggestionToDraft(suggestion, firstDay)}
                    defaultDay={firstDay}
                  />
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
