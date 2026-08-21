import type { Finding } from "@/lib/conflicts";
import { removeParticipants } from "@/lib/actions/items";

export function FindingRow({ finding, projectId }: { finding: Finding; projectId: string }) {
  return (
    <div className={`finding finding-${finding.severity}`}>
      <span className={`dot dot-${finding.severity}`} />
      <span style={{ flex: 1 }}>
        {finding.message}
        {/* When the app knows the fix as well as the problem, it offers the
            fix rather than just complaining. */}
        {finding.suggestion && (
          <form action={removeParticipants} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="item_id" value={finding.itemId ?? ""} />
            {finding.suggestion.travellerIds.map((id) => (
              <input key={id} type="hidden" name="traveller_ids" value={id} />
            ))}
            <button className="btn btn-sm" type="submit">
              {finding.suggestion.label}
            </button>
          </form>
        )}
      </span>
    </div>
  );
}

export function FindingList({
  findings,
  projectId,
}: {
  findings: Finding[];
  projectId: string;
}) {
  if (findings.length === 0) return null;
  const order = { conflict: 0, unverified: 1, match: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="stack-sm" style={{ marginTop: "0.5rem" }}>
      {sorted.map((f, i) => (
        <FindingRow key={`${f.code}-${f.travellerId ?? "g"}-${i}`} finding={f} projectId={projectId} />
      ))}
    </div>
  );
}

export function HealthPanel({
  conflicts,
  unverified,
  matches,
}: {
  conflicts: number;
  unverified: number;
  matches: number;
}) {
  const clean = conflicts === 0 && unverified === 0;
  return (
    <div className="health-panel">
      <div className="health-stat">
        <span className={`dot dot-${conflicts > 0 ? "conflict" : "match"}`} />
        <span className="n">{conflicts}</span>
        <span>{conflicts === 1 ? "conflict" : "conflicts"}</span>
      </div>
      <div className="health-stat">
        <span className="dot dot-unverified" />
        <span className="n">{unverified}</span>
        <span>unverified</span>
      </div>
      <div className="health-stat">
        <span className="dot dot-match" />
        <span className="n">{matches}</span>
        <span>{matches === 1 ? "match" : "matches"}</span>
      </div>
      <div className="spacer" />
      <span className="small muted">
        {clean
          ? "Everything checked so far works for everyone going."
          : "Amber means nobody has told us yet — not that something is wrong."}
      </span>
    </div>
  );
}
