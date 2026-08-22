import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { byItem, evaluate } from "@/lib/conflicts";
import {
  formatDay,
  getChanges,
  getItems,
  getProjectByShareToken,
  getRequirements,
  getTravellers,
  itemSubtitle,
  nowTimeInTrip,
  todayInTrip,
  tripDays,
} from "@/lib/queries";
import { canEdit, guestIdentity, hasGuestAccess } from "@/lib/session";
import ChangesStrip from "@/components/ChangesStrip";

const KIND_LABEL: Record<string, string> = {
  activity: "Activity",
  meal: "Meal",
  transport: "Travel",
  lodging: "Stay",
  note: "Note",
};

function mapsHref(item: { location_name: string | null; address: string | null }) {
  const q = item.address || item.location_name;
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : null;
}

export default async function GroupView({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { token } = await params;
  const { day: dayParam } = await searchParams;
  const project = await getProjectByShareToken(token);
  if (!project) notFound();
  if (!(await hasGuestAccess(project.id))) redirect(`/t/${token}`);

  const [travellers, requirements, items, changes, meId, editable] = await Promise.all([
    getTravellers(project.id),
    getRequirements(project.id),
    getItems(project.id),
    getChanges(project.id, 25),
    guestIdentity(project.id),
    canEdit(project),
  ]);

  // "Today" is always today where the trip is, never where the reader is.
  const today = todayInTrip(project.timezone);
  const now = nowTimeInTrip(project.timezone);
  const days = tripDays(project, items);

  const activeDay =
    dayParam && days.includes(dayParam)
      ? dayParam
      : days.includes(today)
        ? today
        : days.find((d) => d >= today) ?? days[days.length - 1] ?? today;

  const dayItems = items.filter((i) => String(i.day).slice(0, 10) === activeDay);
  const findings = evaluate({ items, travellers, requirements });
  const perItem = byItem(findings);

  // The next thing that happens — the answer to "so what are we doing today?"
  const isToday = activeDay === today;
  const upcoming = dayItems.find((i) => !i.starts_at || i.starts_at.slice(0, 5) >= now);
  const hero = isToday ? (upcoming ?? dayItems[0]) : dayItems[0];
  const dayIndex = days.indexOf(activeDay);
  const me = travellers.find((t) => t.id === meId) ?? null;

  return (
    <main className="shell-phone">
      <div className="topbar">
        <span className="brand">
          Way<span>fare</span>
        </span>
        <div className="row-tight">
          <Link className="btn btn-ghost btn-sm" href={`/t/${token}/people`}>
            People
          </Link>
          {editable && (
            <Link className="btn btn-sm" href={`/trips/${project.id}`}>
              Edit trip
            </Link>
          )}
        </div>
      </div>

      <div className="trip-head">
        <div className="name">{project.name}</div>
        <div className="sub">
          {project.destination ? `${project.destination} · ` : ""}
          {dayIndex >= 0 && days.length > 0 ? `Day ${dayIndex + 1} of ${days.length}` : ""}
          {me ? ` · you're ${me.name}` : ""}
        </div>
      </div>

      <ChangesStrip
        projectId={project.id}
        changes={changes.map((c) => ({
          id: c.id,
          summary: c.summary,
          actor: c.actor_name,
          at: new Date(c.created_at).toISOString(),
        }))}
      />

      {hero ? (
        <div className="today-hero">
          <div className="eyebrow">
            {isToday ? (upcoming ? "Next up" : "Today") : formatDay(activeDay, today).rel ?? "Coming up"}
          </div>
          <div className="headline">{hero.title}</div>
          <div className="row-tight" style={{ marginTop: "0.5rem" }}>
            {hero.starts_at && <span className="when">{hero.starts_at.slice(0, 5)}</span>}
            <span className="kind-tag">{KIND_LABEL[hero.kind] ?? hero.kind}</span>
          </div>
          {itemSubtitle(hero) && <div className="where">{itemSubtitle(hero)}</div>}
          {hero.booking_ref && (
            <div className="small muted" style={{ marginTop: "0.35rem" }}>
              Ref <strong>{hero.booking_ref}</strong>
            </div>
          )}
          {hero.attrs?.wheelchair_accessible === "yes" && (
            <div className="small muted" style={{ marginTop: "0.35rem" }}>Step-free</div>
          )}
          {mapsHref(hero) && (
            <a
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              href={mapsHref(hero)!}
              target="_blank"
              rel="noreferrer"
            >
              Open in Maps
            </a>
          )}

          {/* Only the conflicts that affect the person reading. Everyone else's
              problems are not this reader's business. */}
          {meId &&
            (perItem.get(hero.id) ?? [])
              .filter((f) => f.travellerId === meId && f.severity === "conflict")
              .map((f, i) => (
                <div className="finding finding-conflict" key={i} style={{ marginTop: "0.75rem" }}>
                  <span className="dot dot-conflict" />
                  <span>{f.message}</span>
                </div>
              ))}
        </div>
      ) : (
        <div className="empty">
          <h3>Nothing planned for this day</h3>
          <p className="small">Enjoy the free time.</p>
        </div>
      )}

      {days.length > 1 && (
        <div className="daynav">
          <div className="scroll">
            {days.map((d) => (
              <Link
                key={d}
                href={`/t/${token}/view?day=${d}`}
                className={`daypill ${d === activeDay ? "on" : ""}`}
              >
                {d === today
                  ? "Today"
                  : new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                    })}
              </Link>
            ))}
          </div>
        </div>
      )}

      <section className="day">
        <div className="day-head">
          <span className="date">{formatDay(activeDay, today).date}</span>
          {formatDay(activeDay, today).rel && (
            <span className="rel">{formatDay(activeDay, today).rel}</span>
          )}
        </div>

        {dayItems.length === 0 ? (
          <p className="small muted">Nothing planned.</p>
        ) : (
          dayItems.map((item) => {
            const past = isToday && item.starts_at ? item.starts_at.slice(0, 5) < now : false;
            const notGoing =
              meId && item.participantIds.length > 0 && !item.participantIds.includes(meId);
            return (
              <div className={`item ${past ? "item-past" : ""}`} key={item.id}>
                <div className="item-time">
                  {item.starts_at ? item.starts_at.slice(0, 5) : <span className="none">—</span>}
                </div>
                <div className="item-body">
                  <div className="item-title">{item.title}</div>
                  <div className="item-meta">
                    {itemSubtitle(item)}
                    {notGoing ? " · you're not on this one" : ""}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      <p className="tiny muted center" style={{ marginTop: "2rem" }}>
        Anyone with this link can see the trip. No account needed.
      </p>
    </main>
  );
}
