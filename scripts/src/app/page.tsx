import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/session";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const owner = await currentOwner();
  if (owner) redirect("/trips");
  const { error } = await searchParams;

  return (
    <main className="shell-narrow">
      <div className="topbar">
        <span className="brand">
          Way<span>fare</span>
        </span>
      </div>

      <div style={{ padding: "3rem 0 2rem" }}>
        <h1 style={{ fontSize: "2.4rem", marginBottom: "1rem" }}>
          Trips that work for everyone going on them.
        </h1>
        <p style={{ fontSize: "1.1rem", color: "var(--ink-2)", marginBottom: "2rem", maxWidth: "34rem" }}>
          Tell Wayfare who is coming and what they need — a wheelchair, a ten-minute
          walking limit, a gluten-free kitchen — and it checks every plan against
          them as you build it. Your group just opens a link.
        </p>

        {error && (
          <div className="finding finding-conflict" style={{ marginBottom: "1.5rem" }}>
            <span className="dot dot-conflict" />
            <span>Sign-in didn&apos;t complete ({error}). Try again.</span>
          </div>
        )}

        <a className="btn btn-primary btn-lg" href="/api/auth/login">
          Continue with Google
        </a>

        <p className="small muted" style={{ marginTop: "1rem" }}>
          Only the person organising the trip signs in. Everyone else needs nothing at all.
        </p>
      </div>

      <div className="grid-2" style={{ marginTop: "3rem" }}>
        <div className="card-quiet">
          <h3 style={{ marginBottom: "0.35rem" }}>It knows your group</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Add a mountain hike when someone can&apos;t walk far and Wayfare says so
            — naming the person and the reason — before you save it.
          </p>
        </div>
        <div className="card-quiet">
          <h3 style={{ marginBottom: "0.35rem" }}>Forward your bookings</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Every trip gets its own email address. Forward a hotel confirmation
            and it lands in the itinerary.
          </p>
        </div>
        <div className="card-quiet">
          <h3 style={{ marginBottom: "0.35rem" }}>One link for everyone</h3>
          <p className="small muted" style={{ margin: 0 }}>
            No accounts, no app, no passwords. Send the link and your group opens
            straight into today.
          </p>
        </div>
        <div className="card-quiet">
          <h3 style={{ marginBottom: "0.35rem" }}>Honest about what it doesn&apos;t know</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Green when it&apos;s checked, red when it clashes, amber when nobody has
            told it yet. It never pretends.
          </p>
        </div>
      </div>

      <p className="tiny muted" style={{ marginTop: "3rem" }}>
        Already have a link to a trip? Just open it — there&apos;s nothing to sign in to.{" "}
        <Link href="/trips">Organiser sign-in</Link>
      </p>
    </main>
  );
}
