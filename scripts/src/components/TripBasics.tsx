import { updateTripSettings } from "@/lib/actions/trips";
import type { Project } from "@/lib/types";

/**
 * Where and when.
 *
 * A trip is created with nothing but a name, which is the right amount to ask
 * for at that moment — but the destination and the dates then have nowhere
 * obvious to go, and hiding them in Settings means the itinerary sits there
 * with no days on it and no hint about what to do next. So this appears
 * directly on the itinerary screen: expanded and asking to be filled in while
 * the dates are missing, folded away into a quiet line once they are set.
 */
export default function TripBasics({ project }: { project: Project }) {
  const hasDates = Boolean(project.start_date && project.end_date);

  const form = (
    <form action={updateTripSettings}>
      <input type="hidden" name="project_id" value={project.id} />
      <input type="hidden" name="return_to" value="itinerary" />
      <input type="hidden" name="name" value={project.name} />
      <input type="hidden" name="currency" value={project.currency} />
      {project.link_can_edit && <input type="hidden" name="link_can_edit" value="on" />}

      <div className="field-row">
        <div className="field">
          <label htmlFor="destination">Where are you going?</label>
          <input
            id="destination"
            name="destination"
            type="text"
            defaultValue={project.destination ?? ""}
            placeholder="Rome"
          />
        </div>
        <div className="field">
          <label htmlFor="start_date">First day</label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={project.start_date?.slice(0, 10) ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="end_date">Last day</label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={project.end_date?.slice(0, 10) ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="timezone">Time zone there</label>
          <input id="timezone" name="timezone" type="text" defaultValue={project.timezone} />
        </div>
      </div>

      <button className="btn btn-primary" type="submit">
        Save
      </button>
      <p className="field-hint">
        The dates lay out the days of your trip, and the time zone decides what
        &ldquo;today&rdquo; means for everyone reading it.
      </p>
    </form>
  );

  if (!hasDates) {
    return (
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "0.25rem" }}>Where and when?</h2>
        <p className="small muted" style={{ marginBottom: "1rem" }}>
          Set the dates and every day of the trip appears below, ready to fill in.
        </p>
        {form}
      </div>
    );
  }

  return (
    <details className="card" style={{ marginBottom: "1.5rem" }}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <strong>{project.destination ?? "No destination set"}</strong>
        <span className="muted small">
          {" · "}
          {new Date(`${project.start_date}T00:00:00`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
          {" – "}
          {new Date(`${project.end_date}T00:00:00`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {" · "}
          {project.timezone}
          {" · edit"}
        </span>
      </summary>
      <div style={{ paddingTop: "1rem" }}>{form}</div>
    </details>
  );
}
