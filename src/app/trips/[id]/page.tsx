import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { byItem, evaluate, summarise } from "@/lib/conflicts";
import {
  formatDay,
  getItems,
  getProject,
  getRequirements,
  getTravellers,
  itemSubtitle,
  todayInTrip,
  tripDays,
} from "@/lib/queries";
import { canEdit, canView, currentOwner } from "@/lib/session";
import { FindingList, HealthPanel } from "@/components/Findings";
import TopBar from "@/components/TopBar";
import TripBasics from "@/components/TripBasics";
import TripNav from "@/components/TripNav";

const KIND_LABEL: Record<string, string> = {
  activity: "Activity",
  meal: "Meal",
  transport: "Travel",
  lodging: "Stay",
  note: "Note",
};

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canView(project))) redirect("/");

  const owner = await currentOwner();
  const editable = await canEdit(project);

  const [travellers, requirements, items] = await Promise.all([
    getTravellers(id),
    getRequirements(id),
    getItems(id),
  ]);

  const findings = evaluate({ items, travellers, requirements });
  const stats = summarise(findings);
  const perItem = byItem(findings);
  const dayFindings = findings.filter((f) => !f.itemId);
  const days = tripDays(project, items);
  const today = todayInTrip(project.timezone);

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{project.name}</div>
        <div className="sub">
          {project.destination ? `${project.destination} · ` : ""}
          {travellers.length} {travellers.length === 1 ? "traveller" : "travellers"}
        </div>
      </div>
      <TripNav projectId={id} active="itinerary" />

      {travellers.length === 0 ? (
        <div className="empty">
          <h3>Nobody on this trip yet</h3>
          <p className="small">
            Add the people who are coming first. It takes thirty seconds, and it&apos;s what
            lets everyone else join with a single tap.
          </p>
          <Link className="btn btn-primary" href={`/trips/${id}/people`}>
            Add travellers
          </Link>
        </div>
      ) : (
        <>
          <TripBasics project={project} />
          <HealthPanel {...stats} />

          <div className="row" style={{ margin: "1.5rem 0 0.5rem" }}>
            <h2 style={{ flex: 1 }}>Itinerary</h2>
            {editable && (
              <Link className="btn btn-primary btn-sm" href={`/trips/${id}/items/new`}>
                Add something
              </Link>
            )}
          </div>

          {days.length === 0 ? (
            <div className="empty">
              <h3>Nothing planned yet</h3>
              <p className="small">
                Add the first thing — a flight, a hotel, dinner. Wayfare will check it
                against what your group needs as you go.
              </p>
              {editable && (
                <Link className="btn btn-primary" href={`/trips/${id}/items/new`}>
                  Add something
                </Link>
              )}
            </div>
          ) : (
            days.map((day) => {
              const dayItems = items.filter((i) => String(i.day).slice(0, 10) === day);
              const { date, rel } = formatDay(day, today);
              const thisDayFindings = dayFindings.filter(
                (f) => f.day && String(f.day).slice(0, 10) === day
              );

              return (
                <section className="day" key={day}>
                  <div className="day-head">
                    <span className="date">{date}</span>
                    {rel && <span className="rel">{rel}</span>}
                    <span className="spacer" />
                    {editable && (
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={`/trips/${id}/items/new?day=${day}`}
                      >
                        + Add
                      </Link>
                    )}
                  </div>

                  {thisDayFindings.length > 0 && (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <FindingList findings={thisDayFindings} projectId={id} />
                    </div>
                  )}

                  {dayItems.length === 0 ? (
                    <p className="small muted">Nothing planned.</p>
                  ) : (
                    dayItems.map((item) => {
                      const f = perItem.get(item.id) ?? [];
                      return (
                        <div className="item" id={`item-${item.id}`} key={item.id}>
                          <div className="item-time">
                            {item.starts_at ? (
                              item.starts_at.slice(0, 5)
                            ) : (
                              <span className="none">—</span>
                            )}
                          </div>
                          <div className="item-body">
                            <div className="row-tight">
                              <span className="item-title">{item.title}</span>
                              <span className="kind-tag">{KIND_LABEL[item.kind] ?? item.kind}</span>
                              {editable && (
                                <Link
                                  className="btn btn-ghost btn-sm"
                                  href={`/trips/${id}/items/${item.id}`}
                                >
                                  Edit
                                </Link>
                              )}
                            </div>
                            {itemSubtitle(item) && (
                              <div className="item-meta">{itemSubtitle(item)}</div>
                            )}
                            {item.booking_ref && (
                              <div className="item-meta">Ref {item.booking_ref}</div>
                            )}
                            {item.participantIds.length > 0 && (
                              <div className="item-meta">
                                Only{" "}
                                {travellers
                                  .filter((t) => item.participantIds.includes(t.id))
                                  .map((t) => t.name)
                                  .join(", ")}
                              </div>
                            )}
                            <FindingList findings={f} projectId={id} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </section>
              );
            })
          )}
        </>
      )}
    </main>
  );
}
