"use client";

import { useState } from "react";
import {
  CATEGORY_LABELS,
  INTERESTS,
  PRESETS,
  PRIORITIES,
  STYLES,
  TRAVELS_WITH,
  type Category,
  type Preset,
} from "@/lib/presets";
import { saveTraveller } from "@/lib/actions/people";
import type { HealthDetails, Requirement, Traveller } from "@/lib/types";

/** The practical half of the form and the enjoyable half need different tones.
 *  Nobody *prefers* needing step-free access, so "tell us how you like to
 *  travel" is the wrong voice for it. Same data, two registers. */
const NEEDS_CATEGORIES: Category[] = ["mobility", "diet", "comfort"];
const LIKES_CATEGORIES: Category[] = ["pace", "budget"];

function PresetRow({
  preset,
  existing,
}: {
  preset: Preset;
  existing?: Requirement;
}) {
  const [on, setOn] = useState(Boolean(existing));
  const allowed = preset.allowedLevels ?? ["mandatory", "preferred"];
  const level = existing?.level ?? preset.defaultLevel;
  const fieldValue =
    preset.field && existing
      ? (existing.value?.[preset.field.key] as string | number | undefined)
      : undefined;

  return (
    <div style={{ marginBottom: on ? "0.85rem" : "0.35rem" }}>
      <label className={`chip ${on ? "on" : ""}`}>
        <input
          type="checkbox"
          name={`req_${preset.code}`}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <span>{preset.label}</span>
      </label>

      {on && (
        <div
          className="row-tight"
          style={{ marginTop: "0.5rem", marginLeft: "0.5rem", gap: "0.6rem" }}
        >
          {preset.field && (
            <span className="row-tight" style={{ gap: "0.35rem" }}>
              <span className="small muted">{preset.field.label}</span>
              {preset.field.type === "select" ? (
                <select
                  name={`val_${preset.code}_${preset.field.key}`}
                  defaultValue={String(fieldValue ?? preset.field.default ?? "")}
                  style={{ width: "auto", minWidth: "12rem" }}
                >
                  {preset.field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={preset.field.type === "time" ? "time" : "number"}
                  name={`val_${preset.code}_${preset.field.key}`}
                  min={preset.field.min}
                  max={preset.field.max}
                  defaultValue={String(fieldValue ?? preset.field.default ?? "")}
                  style={{ width: "7rem" }}
                />
              )}
              {preset.field.suffix && <span className="small muted">{preset.field.suffix}</span>}
            </span>
          )}

          {allowed.length > 1 ? (
            <span className="row-tight" style={{ gap: "0.35rem" }}>
              <span className="small muted">This is</span>
              <select
                name={`level_${preset.code}`}
                defaultValue={level}
                style={{ width: "auto" }}
              >
                <option value="mandatory">essential</option>
                <option value="preferred">preferred</option>
              </select>
            </span>
          ) : (
            <input type="hidden" name={`level_${preset.code}`} value={allowed[0]} />
          )}

          {preset.attributes.length === 0 && (
            <span className="badge badge-quiet" title="We'll show this as a reminder but can't check it automatically">
              reminder only
            </span>
          )}
        </div>
      )}

      {on && preset.hint && (
        <p className="field-hint" style={{ marginLeft: "0.5rem" }}>
          {preset.hint}
        </p>
      )}
    </div>
  );
}

export default function TravellerForm({
  projectId,
  traveller,
  requirements,
  health,
}: {
  projectId: string;
  traveller: Traveller;
  requirements: Requirement[];
  health: HealthDetails | null;
}) {
  const byCode = new Map(requirements.map((r) => [r.code, r]));
  const [disclosure, setDisclosure] = useState(traveller.health_disclosure ?? "");

  const group = (categories: Category[]) =>
    categories.map((category) => {
      const presets = PRESETS.filter((p) => p.category === category);
      if (presets.length === 0) return null;
      return (
        <div key={category} style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "0.6rem" }}>{CATEGORY_LABELS[category]}</h3>
          {presets.map((preset) => (
            <PresetRow key={preset.code} preset={preset} existing={byCode.get(preset.code)} />
          ))}
        </div>
      );
    });

  return (
    <form action={saveTraveller}>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="traveller_id" value={traveller.id} />

      {/* ---------------------------------------------------------------- */}
      <div className="field-row">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required defaultValue={traveller.name} />
        </div>
        <div className="field">
          <label htmlFor="age">Age</label>
          <input
            id="age"
            name="age"
            type="number"
            min={0}
            max={120}
            defaultValue={traveller.age ?? ""}
            placeholder="optional"
          />
          <p className="field-hint">Only used for age-restricted activities.</p>
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" defaultValue={traveller.phone ?? ""} placeholder="optional" />
        </div>
      </div>

      {/* ---- needs ------------------------------------------------------ */}
      <div className="section">
        <h2>Anything we need to know?</h2>
        <p className="section-hint">
          So we can check every plan works for everyone. Skip anything that doesn&apos;t apply.
        </p>
        <div className="card">{group(NEEDS_CATEGORIES)}</div>
      </div>

      {/* ---- health ----------------------------------------------------- */}
      <div className="section">
        <h2>Health and medication</h2>
        <p className="section-hint">
          Entirely optional. <strong>You do not need to tell us your medical
          diagnosis</strong> — only what affects planning the journey.
        </p>
        <div className="card">
          <div className="field">
            <label>Do you have health-related needs that affect travel?</label>
            <div className="chips">
              {[
                { v: "none", label: "No specific requirements" },
                { v: "yes", label: "Yes, here's what to consider" },
                { v: "prefer_not_to_say", label: "Prefer not to say" },
              ].map((o) => (
                <label key={o.v} className={`chip ${disclosure === o.v ? "on" : ""}`}>
                  <input
                    type="radio"
                    name="health_disclosure"
                    value={o.v}
                    checked={disclosure === o.v}
                    onChange={() => setDisclosure(o.v)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {disclosure === "yes" && (
            <div style={{ marginTop: "1rem" }}>
              <div className="callout" style={{ marginBottom: "1rem" }}>
                Health details are shown only to you and the trip organiser —{" "}
                <strong>never to the rest of the group</strong>, whatever your sharing
                setting below says.
              </div>

              <div className="chips" style={{ marginBottom: "1rem" }}>
                {[
                  { name: "carries_medication", label: "Travelling with medication", on: health?.carries_medication },
                  { name: "needs_refrigeration", label: "Medication needs refrigeration", on: health?.needs_refrigeration },
                  { name: "needs_documentation", label: "May need documentation at security", on: health?.needs_documentation },
                  { name: "carries_equipment", label: "Carrying medical equipment", on: health?.carries_equipment },
                  { name: "wants_reminders", label: "I'd like medication reminders", on: health?.wants_reminders },
                ].map((c) => (
                  <label key={c.name} className="chip">
                    <input type="checkbox" name={c.name} defaultChecked={c.on ?? false} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="medication_times">Times medication is taken</label>
                  <input
                    id="medication_times"
                    name="medication_times"
                    type="text"
                    defaultValue={health?.medication_times?.join(", ") ?? ""}
                    placeholder="08:00, 20:00"
                  />
                  <p className="field-hint">In the trip&apos;s local time.</p>
                </div>
                <div className="field">
                  <label htmlFor="equipment_note">Equipment</label>
                  <input
                    id="equipment_note"
                    name="equipment_note"
                    type="text"
                    defaultValue={health?.equipment_note ?? ""}
                    placeholder="e.g. CPAP machine"
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="insurance_provider">Travel insurer</label>
                  <input id="insurance_provider" name="insurance_provider" type="text" defaultValue={health?.insurance_provider ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="insurance_phone">Insurer emergency number</label>
                  <input id="insurance_phone" name="insurance_phone" type="tel" defaultValue={health?.insurance_phone ?? ""} />
                </div>
              </div>
              <p className="field-hint" style={{ marginTop: "-0.5rem" }}>
                We deliberately don&apos;t store policy numbers. The emergency number is
                what&apos;s useful during a trip.
              </p>

              <div className="field">
                <label htmlFor="health_notes">Anything else we should consider</label>
                <textarea id="health_notes" name="health_notes" defaultValue={health?.notes ?? ""} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- likes ------------------------------------------------------ */}
      <div className="section">
        <h2>What do you enjoy?</h2>
        <p className="section-hint">
          Tell us a little about how you like to travel, and we&apos;ll make
          recommendations that fit your time, budget and preferences.
        </p>
        <div className="card">
          <div className="field">
            <label>What does your ideal trip feel like?</label>
            <div className="chips">
              {STYLES.map((s) => (
                <label key={s.code} className="chip chip-lg">
                  <input type="checkbox" name={`style_${s.code}`} defaultChecked={byCode.has(s.code)} />
                  <span>
                    {s.emoji} {s.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Interests</label>
            <div className="chips">
              {INTERESTS.map((i) => (
                <label key={i.code} className="chip">
                  <input type="checkbox" name={`interest_${i.code}`} defaultChecked={byCode.has(i.code)} />
                  <span>{i.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Who do you usually travel with?</label>
            <div className="chips">
              {TRAVELS_WITH.map((t) => (
                <label key={t.code} className="chip">
                  <input
                    type="checkbox"
                    name="travels_with"
                    value={t.code}
                    defaultChecked={traveller.travels_with?.includes(t.code)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>When choosing between options, what matters most?</label>
            <div className="chips">
              {PRIORITIES.map((p) => (
                <label key={p.code} className="chip">
                  <input
                    type="checkbox"
                    name="priorities"
                    value={p.code}
                    defaultChecked={traveller.priorities?.includes(p.code)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {group(LIKES_CATEGORIES)}
        </div>
      </div>

      {/* ---- profile & sharing ------------------------------------------ */}
      <div className="section">
        <h2>About you</h2>
        <p className="section-hint">All optional.</p>
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label htmlFor="country">Country of residence</label>
              <input id="country" name="country" type="text" defaultValue={traveller.country ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="language">Preferred language</label>
              <input id="language" name="language" type="text" defaultValue={traveller.language ?? ""} placeholder="ca / es / en" />
            </div>
            <div className="field">
              <label htmlFor="currency">Preferred currency</label>
              <input id="currency" name="currency" type="text" defaultValue={traveller.currency ?? ""} placeholder="EUR" />
            </div>
            <div className="field">
              <label htmlFor="timezone">Your time zone</label>
              <input id="timezone" name="timezone" type="text" defaultValue={traveller.timezone ?? ""} placeholder="Europe/Madrid" />
              <p className="field-hint">The itinerary always shows the trip&apos;s local time.</p>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={traveller.email ?? ""} />
            </div>
          </div>

          <label className="chip" style={{ marginTop: "0.5rem" }}>
            <input type="checkbox" name="share_needs" defaultChecked={traveller.share_needs} />
            <span>Share my requirements with the group</span>
          </label>
          <p className="field-hint">
            When on, things like &ldquo;gluten-free&rdquo; or &ldquo;max 10 min walking&rdquo; appear on the
            group&apos;s People screen, so they can plan around them. Health and
            medication details are never shared either way.
          </p>
        </div>
      </div>

      <div className="row" style={{ marginTop: "1.5rem" }}>
        <button className="btn btn-primary btn-lg" type="submit">
          Save
        </button>
        <a className="btn btn-ghost" href={`/trips/${projectId}/people`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
