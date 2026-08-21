import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { currentOwner } from "@/lib/session";
import TopBar from "@/components/TopBar";

interface Row {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  people: string;
}

export default async function TripsPage() {
  const owner = await currentOwner();
  if (!owner) redirect("/");

  const trips = await query<Row>(
    `SELECT p.id, p.name, p.destination, p.start_date, p.end_date,
            (SELECT count(*) FROM travellers t WHERE t.project_id = p.id) AS people
       FROM projects p
      WHERE p.owner_id = $1
      ORDER BY p.created_at DESC`,
    [owner.id]
  );

  // No trips yet? Don't show an empty list with a button on it — just go
  // straight to the thing they came here to do.
  if (trips.length === 0) redirect("/trips/new");

  return (
    <main className="shell">
      <TopBar ownerName={owner.name} />

      <div className="row" style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ flex: 1 }}>Your trips</h1>
        <Link className="btn btn-primary" href="/trips/new">
          New trip
        </Link>
      </div>

      <div className="stack">
        {trips.map((trip) => (
          <Link key={trip.id} href={`/trips/${trip.id}`} className="card" style={{ textDecoration: "none" }}>
            <div className="row">
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: "1.25rem", fontWeight: 600 }}>
                  {trip.name}
                </div>
                <div className="small muted">
                  {trip.destination ? `${trip.destination} · ` : ""}
                  {trip.start_date
                    ? new Date(trip.start_date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "No dates yet"}
                  {" · "}
                  {trip.people} {Number(trip.people) === 1 ? "person" : "people"}
                </div>
              </div>
              <span className="muted">→</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
