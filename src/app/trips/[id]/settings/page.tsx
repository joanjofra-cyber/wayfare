import { notFound, redirect } from "next/navigation";
import { getProject, inboxAddress, shareUrl } from "@/lib/queries";
import { canEdit, currentOwner } from "@/lib/session";
import { regenerateShareLink, updateTripSettings } from "@/lib/actions/trips";
import CopyRow from "@/components/CopyRow";
import TopBar from "@/components/TopBar";
import TripNav from "@/components/TripNav";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; regenerated?: string }>;
}) {
  const { id } = await params;
  const { saved, regenerated } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(await canEdit(project))) redirect(`/trips/${id}`);
  const owner = await currentOwner();
  const isOwner = owner?.id === project.owner_id;

  return (
    <main className="shell">
      <TopBar ownerName={owner?.name} />
      <div className="trip-head">
        <div className="name">{project.name}</div>
      </div>
      <TripNav projectId={id} active="settings" />

      {saved && (
        <div className="finding finding-match" style={{ marginBottom: "1.5rem" }}>
          <span className="dot dot-match" />
          <span>Saved.</span>
        </div>
      )}
      {regenerated && (
        <div className="finding finding-unverified" style={{ marginBottom: "1.5rem" }}>
          <span className="dot dot-unverified" />
          <span>New link created. The old one no longer works — send this one to your group.</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Sharing</h2>
        <label>Share link</label>
        <CopyRow value={shareUrl(project.share_token)} />
        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          Anyone with this link can see the trip. Send it to your group on WhatsApp.
        </p>

        <label>Documents inbox</label>
        <CopyRow value={inboxAddress(project.inbox_token)} />
        <p className="field-hint">
          Forward booking confirmations here and they land in this trip.
        </p>
      </div>

      <form action={updateTripSettings} className="card" style={{ marginBottom: "1.5rem" }}>
        <input type="hidden" name="project_id" value={id} />
        <h2 style={{ marginBottom: "1rem" }}>Trip</h2>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={project.name} required />
        </div>
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input id="destination" name="destination" type="text" defaultValue={project.destination ?? ""} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="start_date">Starts</label>
            <input id="start_date" name="start_date" type="date" defaultValue={project.start_date?.slice(0, 10) ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="end_date">Ends</label>
            <input id="end_date" name="end_date" type="date" defaultValue={project.end_date?.slice(0, 10) ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="timezone">Time zone of the trip</label>
            <input id="timezone" name="timezone" type="text" defaultValue={project.timezone} />
            <p className="field-hint">Decides what &ldquo;today&rdquo; means for everyone.</p>
          </div>
          <div className="field">
            <label htmlFor="currency">Currency</label>
            <input id="currency" name="currency" type="text" defaultValue={project.currency} />
          </div>
        </div>

        <label className="chip" style={{ marginTop: "0.5rem" }}>
          <input type="checkbox" name="link_can_edit" defaultChecked={project.link_can_edit} />
          <span>People with the link can edit the itinerary</span>
        </label>
        <p className="field-hint">
          Turn this off and the link becomes read-only — which is what you want if
          you are planning this trip on someone else&apos;s behalf.
        </p>

        <button className="btn btn-primary" type="submit" style={{ marginTop: "1rem" }}>
          Save
        </button>
      </form>

      {isOwner && (
        <form action={regenerateShareLink} className="card">
          <input type="hidden" name="project_id" value={id} />
          <h2 style={{ marginBottom: "0.5rem" }}>Replace the share link</h2>
          <p className="small muted">
            Use this if the link ended up somewhere it shouldn&apos;t have. Everyone will
            need the new one, so only do it if you mean it.
          </p>
          <button className="btn btn-danger btn-sm" type="submit">
            Create a new link
          </button>
        </form>
      )}
    </main>
  );
}
