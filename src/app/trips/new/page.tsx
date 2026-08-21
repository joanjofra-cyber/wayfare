import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/session";
import { createTrip } from "@/lib/actions/trips";
import TopBar from "@/components/TopBar";

export default async function NewTripPage() {
  const owner = await currentOwner();
  if (!owner) redirect("/");

  return (
    <main className="shell-narrow">
      <TopBar ownerName={owner.name} />

      <div style={{ padding: "1.5rem 0" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Name your trip</h1>
        <p className="muted" style={{ marginBottom: "2rem" }}>
          That&apos;s all we need to start. Dates, destination and everything else can
          come later.
        </p>

        <form action={createTrip}>
          <div className="field">
            <label htmlFor="name">Trip name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              maxLength={80}
              placeholder="Rome with the family"
            />
          </div>

          <label className="chip" style={{ marginBottom: "1.5rem" }}>
            <input type="checkbox" name="im_going" defaultChecked />
            <span>I&apos;m going on this trip</span>
          </label>
          <p className="field-hint" style={{ marginTop: "-1.25rem", marginBottom: "1.5rem" }}>
            Untick if you&apos;re planning this for other people.
          </p>

          <button className="btn btn-primary btn-lg" type="submit">
            Create trip
          </button>
        </form>
      </div>
    </main>
  );
}
