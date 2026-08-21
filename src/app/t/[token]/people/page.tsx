import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectByShareToken, getRequirements, getTravellers } from "@/lib/queries";
import { guestIdentity, hasGuestAccess } from "@/lib/session";
import { PRESET_BY_CODE } from "@/lib/presets";

/**
 * Who's who.
 *
 * Two rules hold this screen together:
 *   1. A traveller's requirements appear only if they chose to share them.
 *   2. Health and medication details never appear here at all, whatever
 *      anyone chose. They are for the person and the organiser only.
 *
 * The result is a screen that is genuinely useful mid-trip — a name and a
 * number to ring when somebody is lost — without turning a WhatsApp-forwarded
 * link into a published medical record.
 */
export default async function GroupPeoplePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getProjectByShareToken(token);
  if (!project) notFound();
  if (!(await hasGuestAccess(project.id))) redirect(`/t/${token}`);

  const [travellers, requirements, meId] = await Promise.all([
    getTravellers(project.id),
    getRequirements(project.id),
    guestIdentity(project.id),
  ]);

  const needsBy = new Map<string, string[]>();
  for (const req of requirements) {
    if (!req.traveller_id || req.level !== "mandatory") continue;
    const label = PRESET_BY_CODE[req.code]?.label;
    if (!label) continue;
    const list = needsBy.get(req.traveller_id) ?? [];
    list.push(label);
    needsBy.set(req.traveller_id, list);
  }

  return (
    <main className="shell-phone">
      <div className="topbar">
        <Link className="brand" href={`/t/${token}/view`}>
          Way<span>fare</span>
        </Link>
        <Link className="btn btn-ghost btn-sm" href={`/t/${token}/view`}>
          Itinerary
        </Link>
      </div>

      <h1 style={{ marginBottom: "0.25rem" }}>Who&apos;s on this trip</h1>
      <p className="muted small" style={{ marginBottom: "1.5rem" }}>
        Tap a number to call. Useful for exactly the moment you need it.
      </p>

      <div className="card">
        {travellers.map((t) => {
          const needs = t.share_needs ? needsBy.get(t.id) ?? [] : [];
          return (
            <div className="person" key={t.id}>
              <div className="avatar">{t.name.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-tight">
                  <strong>{t.name}</strong>
                  {t.id === meId && <span className="badge badge-quiet">you</span>}
                </div>
                {needs.length > 0 && <div className="small muted">{needs.join(" · ")}</div>}
                {!t.share_needs && (
                  <div className="tiny muted">Keeps their requirements private</div>
                )}
              </div>
              {t.phone && (
                <a className="btn btn-sm" href={`tel:${t.phone.replace(/\s+/g, "")}`}>
                  Call
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="tiny muted" style={{ marginTop: "1rem" }}>
        Health and medication details are never shown here — only to the person
        themselves and whoever organised the trip.
      </p>
    </main>
  );
}
