import { notFound, redirect } from "next/navigation";
import { getProjectByShareToken, getTravellers } from "@/lib/queries";
import { hasGuestAccess } from "@/lib/session";
import { chooseIdentity } from "@/lib/actions/trips";

/**
 * "Which of these people are you?"
 *
 * The common case has to be one tap — that is the whole design of this screen.
 * Names the organiser already added are large and tappable; typing is the
 * exception, tucked underneath, for someone who isn't on the list.
 *
 * This is identification, not authentication. Anyone could claim to be anyone,
 * and that is fine: it is a holiday itinerary, and the alternative is accounts.
 */
export default async function WhoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await getProjectByShareToken(token);
  if (!project) notFound();
  if (!(await hasGuestAccess(project.id))) redirect(`/t/${token}`);

  const travellers = await getTravellers(project.id);

  return (
    <main className="shell-phone">
      <div style={{ padding: "2.5rem 0 1.5rem" }}>
        <div className="small muted">{project.name}</div>
        <h1 style={{ marginTop: "0.25rem" }}>Who are you?</h1>
        <p className="muted small">So we can show you what matters to you, and put your name on changes you make.</p>
      </div>

      <form action={chooseIdentity}>
        <input type="hidden" name="project_id" value={project.id} />
        <input type="hidden" name="token" value={token} />

        <div className="stack-sm">
          {travellers.map((t) => (
            <button
              key={t.id}
              className="btn btn-lg"
              type="submit"
              name="traveller_id"
              value={t.id}
              style={{ width: "100%", justifyContent: "flex-start" }}
            >
              {t.name}
            </button>
          ))}
        </div>

        <details className="more" style={{ marginTop: "1.5rem" }}>
          <summary>I&apos;m not on the list</summary>
          <div style={{ paddingTop: "0.75rem" }}>
            <div className="field">
              <label htmlFor="new_name">Your name</label>
              <input id="new_name" name="new_name" type="text" maxLength={60} />
            </div>
            <button className="btn btn-primary" type="submit" name="traveller_id" value="__new__">
              Continue
            </button>
          </div>
        </details>
      </form>
    </main>
  );
}
