"use client";

import { useState } from "react";
import { ATTRIBUTE_UI, INTERESTS, attributesForItem } from "@/lib/presets";
import { createItem, deleteItem, updateItem } from "@/lib/actions/items";
import { TRANSPORT_MODES, type Item, type ItemAttributes, type Kind, type Traveller } from "@/lib/types";

const KINDS: { value: Kind; label: string; defaultTime?: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "meal", label: "Meal", defaultTime: "20:30" },
  { value: "transport", label: "Travel" },
  { value: "lodging", label: "Stay", defaultTime: "15:00" },
  { value: "note", label: "Note" },
];

function TriField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select name={name} defaultValue={value}>
        <option value="unknown">Don&apos;t know</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

export default function ItemForm({
  projectId,
  travellers,
  activeCodes,
  item,
  attrs,
  participantIds,
  defaultDay,
  draft,
  documentId,
}: {
  projectId: string;
  travellers: Traveller[];
  activeCodes: string[];
  item?: Item;
  attrs?: ItemAttributes | null;
  participantIds?: string[];
  defaultDay?: string;
  /** Pre-filled values read out of a forwarded booking, awaiting confirmation. */
  draft?: Partial<Item>;
  documentId?: string;
}) {
  // An existing item wins over a draft; a draft wins over nothing.
  const v: Partial<Item> = { ...(draft ?? {}), ...(item ?? {}) };
  const [kind, setKind] = useState<Kind>((v.kind as Kind) ?? "activity");
  const [everyone, setEveryone] = useState((participantIds ?? []).length === 0);

  // Two filters, both necessary: relevant to this kind of thing, AND used by a
  // requirement somebody on this trip actually has. A flight does not care
  // about gluten; a group with no wheelchair user is never asked about steps.
  const relevant = attributesForItem(kind, activeCodes);
  const showMinAge = kind === "activity" || kind === "meal" || kind === "transport";

  const triValue = (key: string): string => {
    if (!attrs) return "unknown";
    const v = (attrs as unknown as Record<string, unknown>)[key];
    if (v === true) return "yes";
    if (v === false) return "no";
    if (v === "yes" || v === "no") return v;
    return "unknown";
  };

  return (
    <form action={item ? updateItem : createItem}>
      <input type="hidden" name="project_id" value={projectId} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      {documentId && <input type="hidden" name="document_id" value={documentId} />}

      <div className="field">
        <label htmlFor="title">What is it?</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          autoFocus={!item}
          defaultValue={v.title ?? ""}
          placeholder="Dinner at Trattoria da Enzo"
        />
      </div>

      <div className="field">
        <label>Kind</label>
        <div className="chips">
          {KINDS.map((k) => (
            <label key={k.value} className={`chip ${kind === k.value ? "on" : ""}`}>
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
              />
              <span>{k.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="day">{kind === "lodging" ? "Check in" : "Day"}</label>
          <input
            id="day"
            name="day"
            type="date"
            required
            defaultValue={v.day ? String(v.day).slice(0, 10) : defaultDay ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="starts_at">
            {kind === "transport" ? "Departs" : kind === "lodging" ? "Check-in time" : "Starts"}
          </label>
          <input id="starts_at" name="starts_at" type="time" defaultValue={v.starts_at?.slice(0, 5) ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="ends_at">{kind === "transport" ? "Arrives" : "Ends"}</label>
          <input id="ends_at" name="ends_at" type="time" defaultValue={v.ends_at?.slice(0, 5) ?? ""} />
        </div>
        {(kind === "lodging" || kind === "transport") && (
          <div className="field">
            <label htmlFor="ends_day">
              {kind === "lodging" ? "Check out" : "Arrival day"}
            </label>
            <input
              id="ends_day"
              name="ends_day"
              type="date"
              defaultValue={v.ends_day ? String(v.ends_day).slice(0, 10) : ""}
            />
            <p className="field-hint">
              {kind === "lodging" ? "Leave blank for one night." : "Only if it lands the next day."}
            </p>
          </div>
        )}
      </div>

      {/* ---- what a flight or a train actually has ---------------------- */}
      {kind === "transport" && (
        <div className="card-quiet" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>Journey</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="mode">How</label>
              <select id="mode" name="mode" defaultValue={v.mode ?? "flight"}>
                {TRANSPORT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="carrier">Operator</label>
              <input id="carrier" name="carrier" type="text" defaultValue={v.carrier ?? ""} placeholder="Vueling" />
            </div>
            <div className="field">
              <label htmlFor="service_number">Number</label>
              <input id="service_number" name="service_number" type="text" defaultValue={v.service_number ?? ""} placeholder="VY6000" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="origin">From</label>
              <input id="origin" name="origin" type="text" defaultValue={v.origin ?? ""} placeholder="Barcelona" />
            </div>
            <div className="field">
              <label htmlFor="origin_code">Code</label>
              <input id="origin_code" name="origin_code" type="text" maxLength={5} defaultValue={v.origin_code ?? ""} placeholder="BCN" />
            </div>
            <div className="field">
              <label htmlFor="destination">To</label>
              <input id="destination" name="destination" type="text" defaultValue={v.destination ?? ""} placeholder="Rome" />
            </div>
            <div className="field">
              <label htmlFor="destination_code">Code</label>
              <input id="destination_code" name="destination_code" type="text" maxLength={5} defaultValue={v.destination_code ?? ""} placeholder="FCO" />
            </div>
            <div className="field">
              <label htmlFor="terminal">Terminal</label>
              <input id="terminal" name="terminal" type="text" defaultValue={v.terminal ?? ""} placeholder="T1" />
            </div>
          </div>
        </div>
      )}

      {kind === "lodging" && (
        <div className="card-quiet" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>The stay</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="carrier">Property</label>
              <input id="carrier" name="carrier" type="text" defaultValue={v.carrier ?? ""} placeholder="Hotel Santa Maria" />
            </div>
            <div className="field">
              <label htmlFor="service_number">Room</label>
              <input id="service_number" name="service_number" type="text" defaultValue={v.service_number ?? ""} placeholder="Double, 2 guests" />
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="location_name">Where</label>
        <input
          id="location_name"
          name="location_name"
          type="text"
          defaultValue={v.location_name ?? ""}
          placeholder="Via dei Vascellari 29"
        />
      </div>

      {/* ---- what this needs of people ---------------------------------- */}
      {(relevant.length > 0 || showMinAge) && kind !== "note" && (
        <div className="card-quiet" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.25rem" }}>What this asks of people</h3>
          <p className="small muted" style={{ marginBottom: "1rem" }}>
            Only what matters for your group. Leave anything you don&apos;t know —
            Wayfare will say it isn&apos;t confirmed rather than guessing.
          </p>

          <div className="field-row">
            {relevant.map((key) => {
              const ui = ATTRIBUTE_UI[key];
              if (!ui) return null;
              if (ui.control === "number") {
                return (
                  <div className="field" key={key}>
                    <label htmlFor={`attr_${key}`}>
                      {ui.label} {ui.suffix ? `(${ui.suffix})` : ""}
                    </label>
                    <input
                      id={`attr_${key}`}
                      name={`attr_${key}`}
                      type="number"
                      min={0}
                      defaultValue={
                        (attrs as unknown as Record<string, number | null>)?.[key] ?? ""
                      }
                    />
                  </div>
                );
              }
              if (ui.control === "terrain") {
                return (
                  <div className="field" key={key}>
                    <label htmlFor="attr_terrain">Ground</label>
                    <select id="attr_terrain" name="attr_terrain" defaultValue={attrs?.terrain ?? ""}>
                      <option value="">Don&apos;t know</option>
                      <option value="flat">Flat</option>
                      <option value="hilly">Hilly</option>
                      <option value="rough">Rough</option>
                    </select>
                  </div>
                );
              }
              return <TriField key={key} name={`attr_${key}`} label={ui.label} value={triValue(key)} />;
            })}

            {showMinAge && (
              <div className="field">
                <label htmlFor="attr_min_age">Minimum age</label>
                <input
                  id="attr_min_age"
                  name="attr_min_age"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={attrs?.min_age ?? ""}
                  placeholder="none"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- who's going ------------------------------------------------- */}
      {travellers.length > 0 && kind !== "note" && (
        <div className="field">
          <label>Who&apos;s going</label>
          <label className={`chip ${everyone ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={everyone}
              onChange={(e) => setEveryone(e.target.checked)}
            />
            <span>Everyone</span>
          </label>
          {!everyone && (
            <div className="chips" style={{ marginTop: "0.5rem" }}>
              {travellers.map((t) => (
                <label key={t.id} className="chip">
                  <input
                    type="checkbox"
                    name="participants"
                    value={t.id}
                    defaultChecked={
                      participantIds && participantIds.length > 0
                        ? participantIds.includes(t.id)
                        : true
                    }
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="field-hint">
            Leave it on Everyone unless someone is sitting this one out.
          </p>
        </div>
      )}

      <details className="more" open={Boolean(draft) || Boolean(v.booking_ref) || Boolean(v.notes)}>
        <summary>More details</summary>
        <div style={{ paddingTop: "0.75rem" }}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cost">Cost per person</label>
              <input id="cost" name="cost" type="number" step="0.01" min="0" defaultValue={v.cost ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="booking_ref">Booking reference</label>
              <input id="booking_ref" name="booking_ref" type="text" defaultValue={v.booking_ref ?? ""} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input id="address" name="address" type="text" defaultValue={v.address ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="url">Link</label>
            <input id="url" name="url" type="url" defaultValue={v.url ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" defaultValue={v.notes ?? ""} />
          </div>
          {kind !== "note" && (
            <div className="field">
              <label>What kind of thing is this? (helps match interests)</label>
              <div className="chips">
                {INTERESTS.map((tag) => (
                  <label key={tag.code} className="chip">
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag.code}
                      defaultChecked={attrs?.tags?.includes(tag.code) ?? false}
                    />
                    <span>{tag.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      <div className="row" style={{ marginTop: "1.5rem" }}>
        <button className="btn btn-primary" type="submit">
          {item ? "Save changes" : "Add to itinerary"}
        </button>
        <a className="btn btn-ghost" href={`/trips/${projectId}`}>
          Cancel
        </a>
      </div>

      {item && (
        <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-danger btn-sm" type="submit" formAction={deleteItem}>
            Remove from itinerary
          </button>
        </div>
      )}
    </form>
  );
}
